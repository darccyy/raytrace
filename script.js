// Create game canvas
const canvas = document.createElement("canvas");
canvas.width = 1024;
canvas.height = 512;
document.getElementById("contain").appendChild(canvas);
const ctx = canvas.getContext("2d");
F.createListeners();

// Constant values
const size = 10,
  colors = ["black", ...new Array(10).fill(null).map(i => F.randomHex())],
  playerMaxVelocity = 7,
  playerSpeed = 20,
  playerSlow = 30,
  playerRotationSpeed = 6,
  blockDensity = 0.15,
  fov = Math.PI / 2,
  rayRes = 220,
  rayMaxDist = 6,
  rayTestInterval = 0.02;

// Global variables
var player,
  vision,
  grid,
  eyes,
  topView = false,
  didJust = {};

// Reset game
function reset() {
  player = {
    x: 4.5,
    y: 4.5,
    r: 0.3,
    v: 0,
    d: 0,
  };
  vision = [];

  grid = [];
  for (var x = 0; x < size; x++) {
    grid.push([]);
    for (var y = 0; y < size; y++) {
      grid[x].push(
        (x <= 0 ||
          x + 1 >= size ||
          y <= 0 ||
          y + 1 >= size ||
          Math.random() > 1 - blockDensity) &&
          !(x === Math.floor(player.x) && y === Math.floor(player.y))
          ? F.randomInt(1, colors.length)
          : 0,
      );
    }
  }
}

// Draw game
function render() {
  canvas.width = canvas.height * (topView ? 2 : 1);
  ctx.fillStyle = colors[0];
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Zoom
  ctx.save();
  ctx.scale(canvas.height / size, canvas.height / size);
  var pixelSize = size / canvas.height;

  if (topView) {
    // Move camera to second half of canvas
    ctx.save();
    ctx.translate(size, 0);

    // Grid
    for (var x = 0; x < grid.length; x++) {
      for (var y = 0; y < grid[x].length; y++) {
        if (!grid[x][y]) {
          continue;
        }

        ctx.fillStyle = colors[grid[x][y]];
        ctx.fillRect(x, y, 1 + pixelSize, 1 + pixelSize);
      }
    }

    // Player
    ctx.fillStyle = "blue";
    ctx.beginPath();
    ctx.ellipse(player.x, player.y, player.r, player.r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.ellipse(
      player.x,
      player.y,
      player.r * 0.7,
      player.r * 0.7,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    if (eyes) {
      // Player direction
      ctx.fillStyle = "red";
      ctx.beginPath();
      ctx.ellipse(
        eyes?.x,
        eyes?.y,
        player.r * 0.3,
        player.r * 0.3,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      // Rays
      for (var i = 0; i < vision.length; i++) {
        var ray = vision[i];
        var gradient = ctx.createLinearGradient(
          eyes.x,
          eyes.y,
          ray.max.x,
          ray.max.y,
        );
        gradient.addColorStop(0, ray.color ? colors[ray.color] : "grey");
        gradient.addColorStop(1, "#0000");
        ctx.strokeStyle = gradient;
        ctx.lineWidth = pixelSize;
        ctx.beginPath();
        ctx.moveTo(eyes.x, eyes.y);
        ctx.lineTo(ray.x, ray.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // POV
  for (var i = 0; i < vision.length; i++) {
    var ray = vision[i];
    ctx.fillStyle = colors[ray.color];
    var hsv = F.hex2hsv(ctx.fillStyle);
    hsv.v *= 1 - ray.dist / rayMaxDist;
    ctx.fillStyle = F.hsv2hex(hsv);

    ctx.fillRect(
      i * (size / vision.length),
      0,
      size / vision.length + pixelSize,
      size,
    );
  }

  ctx.restore();
}

// Update game objects
function update(mod) {
  // Reset
  if (F.keys.r_) {
    if (!didJust.reset) {
      didJust.reset = true;
      reset();
    }
  } else {
    didJust.reset = false;
  }

  // Show top view
  if (F.keys.Space) {
    if (!didJust.changeView) {
      didJust.changeView = true;
      topView = !topView;
    }
  } else {
    didJust.changeView = false;
  }

  // Player rotation
  if (F.keys.a_ ^ F.keys.d_) {
    player.d += playerRotationSpeed * mod * (F.keys.a_ ? -1 : 1);
  }

  // Player movement
  if (F.keys.w_ ^ F.keys.s_) {
    player.v += playerSpeed * mod * (F.keys.w_ ? -1 : 1);
  } else {
    if (Math.abs(player.v) > 1) {
      player.v -= playerSlow * mod * Math.sign(player.v);
    } else {
      player.v = 0;
    }
  }
  player.v = F.border(player.v, -playerMaxVelocity, playerMaxVelocity);
  var vel = F.angle2coords(0, 0, player.d, -player.v * mod);

  // Player collision
  if (vel.x && vel.y) {
    for (
      var x = Math.floor(player.x + Math.min(0, vel.x) - player.r);
      x <= Math.floor(player.x + Math.max(0, vel.x) + player.r);
      x++
    ) {
      for (
        var y = Math.floor(player.y + Math.min(0, vel.y) - player.r);
        y <= Math.floor(player.y + Math.max(0, vel.y) + player.r);
        y++
      ) {
        if (grid[x]?.[y]) {
          if (
            circle2rect(
              { ...player, x: player.x + vel.x },
              { x, y, w: 1, h: 1 },
            )
          ) {
            vel.x = 0;
          }
          if (
            circle2rect(
              { ...player, y: player.y + vel.y },
              { x, y, w: 1, h: 1 },
            )
          ) {
            vel.y = 0;
          }
        }
      }
    }
  }

  // Player move by velocity
  player.x += vel.x;
  player.y += vel.y;

  // Create rays
  eyes = F.angle2coords(player.x, player.y, player.d, player.r);
  vision = [];
  for (
    var angle = -fov / 2 + player.d;
    angle < fov / 2 + player.d;
    angle += 1 / rayRes
  ) {
    var end = { ...eyes },
      color = 0;
    for (var i = 0; i < rayMaxDist; i += rayTestInterval) {
      end = F.angle2coords(eyes.x, eyes.y, angle, i);
      if (grid[Math.floor(end.x)]?.[Math.floor(end.y)]) {
        color = grid[Math.floor(end.x)][Math.floor(end.y)];
        break;
      }
    }
    vision.push({
      dist: i,
      color,
      ...end,
      max: F.angle2coords(eyes.x, eyes.y, angle, rayMaxDist),
    });
  }
}

function circle2rect(circle, rect) {
  var distX = Math.abs(circle.x - rect.x - rect.w / 2);
  var distY = Math.abs(circle.y - rect.y - rect.h / 2);

  if (distX > rect.w / 2 + circle.r) {
    return false;
  }
  if (distY > rect.h / 2 + circle.r) {
    return false;
  }

  if (distX <= rect.w / 2) {
    return true;
  }
  if (distY <= rect.h / 2) {
    return true;
  }

  var dx = distX - rect.w / 2;
  var dy = distY - rect.h / 2;
  return dx * dx + dy * dy <= circle.r * circle.r;
}

// Run game
function main() {
  render();
  update((Date.now() - then) / 1000);
  then = Date.now();
  requestAnimationFrame(main);
}
var then = Date.now();
reset();
main();
