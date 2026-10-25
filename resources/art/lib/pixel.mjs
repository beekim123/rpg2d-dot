// ASTRA original integer pixel tools. All colors resolve through the project's palette.
function integers(...values) {
  if (values.some(value => !Number.isSafeInteger(value))) throw new Error('pixel coordinates must be integers');
}

export function rgba(hex) {
  if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) throw new Error(`invalid color ${hex}`);
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), hex.length === 9 ? parseInt(hex.slice(7, 9), 16) : 255];
}

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export class PixelCanvas {
  constructor(width, height, palette) {
    integers(width, height);
    if (width < 1 || height < 1 || width * height > 4_194_304) throw new Error('invalid canvas size');
    this.width = width; this.height = height; this.palette = palette;
    this.data = new Uint8Array(width * height * 4);
    this.colors = Object.fromEntries(Object.entries(palette).map(([key, hex]) => [key, rgba(hex)]));
  }
  color(name) {
    if (!this.colors[name]) throw new Error(`unknown palette color: ${name}`);
    return this.colors[name];
  }
  px(x, y, name) {
    integers(x, y); const color = this.color(name);
    if (x >= 0 && y >= 0 && x < this.width && y < this.height) this.data.set(color, (y * this.width + x) * 4);
    return this;
  }
  rect(x, y, width, height, color) {
    integers(x, y, width, height); this.color(color);
    for (let py = Math.max(0, y); py < Math.min(this.height, y + height); py++) {
      for (let px = Math.max(0, x); px < Math.min(this.width, x + width); px++) this.px(px, py, color);
    }
    return this;
  }
  fill(color) { return this.rect(0, 0, this.width, this.height, color); }
  line(x0, y0, x1, y1, color) {
    integers(x0, y0, x1, y1);
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    for (;;) {
      this.px(x0, y0, color);
      if (x0 === x1 && y0 === y1) break;
      const twice = 2 * error;
      if (twice >= dy) { error += dy; x0 += sx; }
      if (twice <= dx) { error += dx; y0 += sy; }
    }
    return this;
  }
  ellipse(x, y, width, height, color) {
    integers(x, y, width, height);
    if (width < 1 || height < 1) return this;
    // Test pixel centres with integer arithmetic; no canvas rasterizer or antialiasing.
    for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
      if ((2 * px + 1 - width) ** 2 * height ** 2 + (2 * py + 1 - height) ** 2 * width ** 2 <= width ** 2 * height ** 2) this.px(x + px, y + py, color);
    }
    return this;
  }
  polygon(points, color) {
    for (const point of points) integers(...point);
    const minY = Math.max(0, Math.min(...points.map(point => point[1])));
    const maxY = Math.min(this.height - 1, Math.max(...points.map(point => point[1])));
    for (let y = minY; y <= maxY; y++) {
      const cuts = [];
      for (let i = 0; i < points.length; i++) {
        const [x0, y0] = points[i], [x1, y1] = points[(i + 1) % points.length];
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) cuts.push(x0 + (y - y0) * (x1 - x0) / (y1 - y0));
      }
      cuts.sort((a, b) => a - b);
      for (let i = 0; i + 1 < cuts.length; i += 2) this.line(Math.ceil(cuts[i]), y, Math.floor(cuts[i + 1]), y, color);
    }
    for (let i = 0; i < points.length; i++) this.line(...points[i], ...points[(i + 1) % points.length], color);
    return this;
  }
  stamp(image, x, y) {
    integers(x, y);
    for (let py = 0; py < image.height; py++) for (let px = 0; px < image.width; px++) {
      const source = (py * image.width + px) * 4;
      if (image.data[source + 3] && x + px >= 0 && y + py >= 0 && x + px < this.width && y + py < this.height) this.data.set(image.data.subarray(source, source + 4), ((y + py) * this.width + x + px) * 4);
    }
    return this;
  }
  outline(color) {
    const original = this.data.slice();
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) {
      if (original[(y * this.width + x) * 4 + 3]) continue;
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < this.width && ny < this.height && original[(ny * this.width + nx) * 4 + 3]) { this.px(x, y, color); break; }
      }
    }
    return this;
  }
  mirror() {
    const output = new PixelCanvas(this.width, this.height, this.palette);
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) output.data.set(this.data.subarray((y * this.width + x) * 4, (y * this.width + x) * 4 + 4), (y * this.width + this.width - 1 - x) * 4);
    return output;
  }
  recolor(mapping) {
    const entries = Object.entries(mapping).map(([from, to]) => [this.color(from), this.color(to)]);
    for (let i = 0; i < this.data.length; i += 4) {
      for (const [from, to] of entries) if (from.every((channel, c) => this.data[i + c] === channel)) { this.data.set(to, i); break; }
    }
    return this;
  }
}
