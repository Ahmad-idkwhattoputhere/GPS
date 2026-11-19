const canvas = document.getElementById("gpsCanvas");
const ctx = canvas.getContext("2d");

const clockSlider = document.getElementById("clockBias");
const noiseSlider = document.getElementById("noise");
const showRanges = document.getElementById("showRanges");

const actual = { x: 500, y: 450 };

const satellites = [
  { x: 100, y: 100, name: "SAT 01" },
  { x: 900, y: 100, name: "SAT 02" },
  { x: 100, y: 900, name: "SAT 03" },
  { x: 900, y: 900, name: "SAT 04" }
];

const noisePattern = [-1, 1, -1, 1];

let dragging = false;
let canvasWidth = 800;
let canvasHeight = 440;
let pixelRatio = 1;

function getMeasurements() {
  const clockBias = Number(clockSlider.value) / 1000;
  const noise = Number(noiseSlider.value) / 1000;

  return satellites.map((satellite, index) => {
    const trueDistance = Math.hypot(
      satellite.x - actual.x,
      satellite.y - actual.y
    );

    return trueDistance + clockBias + noisePattern[index] * noise;
  });
}

function solve3x3(matrix, vector) {
  const a = matrix.map((row, i) => [...row, vector[i]]);

  for (let i = 0; i < 3; i++) {
    let pivot = i;

    for (let j = i + 1; j < 3; j++) {
      if (Math.abs(a[j][i]) > Math.abs(a[pivot][i])) {
        pivot = j;
      }
    }

    if (Math.abs(a[pivot][i]) < 1e-10) return null;

    [a[i], a[pivot]] = [a[pivot], a[i]];

    const divisor = a[i][i];

    for (let k = i; k < 4; k++) {
      a[i][k] /= divisor;
    }

    for (let j = 0; j < 3; j++) {
      if (j === i) continue;

      const factor = a[j][i];

      for (let k = i; k < 4; k++) {
        a[j][k] -= factor * a[i][k];
      }
    }
  }

  return [a[0][3], a[1][3], a[2][3]];
}

function calculatePosition() {
  const measurements = getMeasurements();

  let x = actual.x;
  let y = actual.y;
  let bias = 0;

  // Start away from the true location so the solver must estimate it.
  x = 500;
  y = 500;

  for (let iteration = 0; iteration < 40; iteration++) {
    const matrix = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ];

    const vector = [0, 0, 0];

    satellites.forEach((satellite, index) => {
      const dx = x - satellite.x;
      const dy = y - satellite.y;
      const distance = Math.hypot(dx, dy);

      if (distance < 1e-8) return;

      const predicted = distance + bias;
      const residual = measurements[index] - predicted;
      const row = [dx / distance, dy / distance, 1];

      for (let a = 0; a < 3; a++) {
        vector[a] += row[a] * residual;

        for (let b = 0; b < 3; b++) {
          matrix[a][b] += row[a] * row[b];
        }
      }
    });

    const change = solve3x3(matrix, vector);
    if (!change) break;

    x += change[0];
    y += change[1];
    bias += change[2];

    if (Math.hypot(...change) < 1e-8) break;
  }

  return { x, y, bias };
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();

  canvasWidth = rect.width;
  canvasHeight = rect.height;
  pixelRatio = window.devicePixelRatio || 1;

  canvas.width = Math.round(canvasWidth * pixelRatio);
  canvas.height = Math.round(canvasHeight * pixelRatio);

  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  draw();
}

function mapX(x) {
  return (x / 1000) * canvasWidth;
}

function mapY(y) {
  return (y / 1000) * canvasHeight;
}

function drawGrid() {
  ctx.strokeStyle = "#1d2d43";
  ctx.lineWidth = 1;

  for (let i = 0; i <= 1000; i += 100) {
    const x = mapX(i);
    const y = mapY(i);

    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasHeight);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasWidth, y);
    ctx.stroke();

    if (i % 200 === 0) {
      ctx.fillStyle = "#63748d";
      ctx.font = "9px DM Sans";
      ctx.fillText(String(i), x + 4, canvasHeight - 7);
    }
  }
}

function drawSatellite(satellite, index) {
  const x = mapX(satellite.x);
  const y = mapY(satellite.y);

  ctx.save();

  ctx.shadowColor = "#55dfc1";
  ctx.shadowBlur = 13;

  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#55dfc1";
  ctx.fill();

  ctx.restore();

  ctx.fillStyle = "#9db0c8";
  ctx.font = "10px DM Sans";
  ctx.fillText(satellite.name, x + 11, y - 10);
}

function drawReceiver(x, y, color, label, radius) {
  const px = mapX(x);
  const py = mapY(y);

  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 15;

  ctx.beginPath();
  ctx.arc(px, py, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.restore();

  ctx.beginPath();
  ctx.arc(px, py, radius + 5, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = color;
  ctx.font = "bold 10px DM Sans";
  ctx.fillText(label, px + 12, py + 4);
}

function draw() {
  if (!canvasWidth || !canvasHeight) return;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  const position = calculatePosition();
  const measurements = getMeasurements();

  drawGrid();

  // Draw each measured pseudorange as a circle around its satellite.
  if (showRanges.checked) {
    satellites.forEach((satellite, index) => {
      const radius = Math.max(0, measurements[index]);
      const scaleX = canvasWidth / 1000;
      const scaleY = canvasHeight / 1000;

      ctx.beginPath();
      ctx.ellipse(
        mapX(satellite.x),
        mapY(satellite.y),
        radius * scaleX,
        radius * scaleY,
        0,
        0,
        Math.PI * 2
      );

      ctx.strokeStyle = "rgba(85, 223, 193, 0.33)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }

  satellites.forEach(drawSatellite);

  // The estimated position is orange; the actual receiver is white.
  drawReceiver(position.x, position.y, "#ffb85c", "GPS ESTIMATE", 6);
  drawReceiver(actual.x, actual.y, "#f4f7ff", "YOU", 6);

  // Show the gap between actual and estimated positions.
  ctx.beginPath();
  ctx.moveTo(mapX(actual.x), mapY(actual.y));
  ctx.lineTo(mapX(position.x), mapY(position.y));
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = "#ffb85c";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);

  updateStats(position);
}

function updateStats(position) {
  const error = Math.hypot(
    position.x - actual.x,
    position.y - actual.y
  );

  document.getElementById("clockValue").textContent =
    `${Number(clockSlider.value)} m`;

  document.getElementById("noiseValue").textContent =
    `${Number(noiseSlider.value)} m`;

  document.getElementById("xResult").innerHTML =
    `${position.x.toFixed(2)} <small>km</small>`;

  document.getElementById("yResult").innerHTML =
    `${position.y.toFixed(2)} <small>km</small>`;

  document.getElementById("biasResult").innerHTML =
    `${(position.bias * 1000).toFixed(2)} <small>m</small>`;

  document.getElementById("errorResult").innerHTML =
    `${error.toFixed(3)} <small>km</small>`;

  document.getElementById("receiverCoords").textContent =
    `X: ${actual.x.toFixed(0)} · Y: ${actual.y.toFixed(0)}`;

  document.getElementById("rangeToggleLabel").textContent =
    showRanges.checked ? "ON" : "OFF";
}

function update() {
  draw();
}

function pointerToMap(event) {
  const rect = canvas.getBoundingClientRect();

  const x = ((event.clientX - rect.left) / rect.width) * 1000;
  const y = ((event.clientY - rect.top) / rect.height) * 1000;

  return {
    x: Math.max(35, Math.min(965, x)),
    y: Math.max(35, Math.min(965, y))
  };
}

function isNearReceiver(point) {
  const dx = mapX(actual.x) - mapX(point.x);
  const dy = mapY(actual.y) - mapY(point.y);

  return Math.hypot(dx, dy) < 25;
}

canvas.addEventListener("pointerdown", event => {
  const point = pointerToMap(event);

  // Drag the receiver if the pointer starts close to it.
  if (isNearReceiver(point)) {
    dragging = true;
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = "grabbing";
  } else {
    // Otherwise, move the receiver to the clicked location.
    actual.x = point.x;
    actual.y = point.y;
    update();
  }
});

canvas.addEventListener("pointermove", event => {
  const point = pointerToMap(event);

  if (dragging) {
    actual.x = point.x;
    actual.y = point.y;
    update();
  } else {
    canvas.style.cursor = isNearReceiver(point) ? "grab" : "crosshair";
  }
});

function stopDragging() {
  dragging = false;
  canvas.style.cursor = "crosshair";
}

canvas.addEventListener("pointerup", stopDragging);
canvas.addEventListener("pointercancel", stopDragging);
canvas.addEventListener("lostpointercapture", stopDragging);

clockSlider.addEventListener("input", update);
noiseSlider.addEventListener("input", update);
showRanges.addEventListener("change", update);

document.querySelectorAll("[data-preset]").forEach(button => {
  button.addEventListener("click", () => {
    const preset = button.dataset.preset;

    if (preset === "perfect") {
      clockSlider.value = 0;
      noiseSlider.value = 0;
    } else if (preset === "clock") {
      clockSlider.value = 500;
      noiseSlider.value = 0;
    } else if (preset === "noise") {
      clockSlider.value = 0;
      noiseSlider.value = 80;
    }

    update();
  });
});

document.getElementById("resetButton").addEventListener("click", () => {
  actual.x = 500;
  actual.y = 450;
  clockSlider.value = 0;
  noiseSlider.value = 0;
  showRanges.checked = true;
  update();
});

window.addEventListener("resize", resizeCanvas);

resizeCanvas();