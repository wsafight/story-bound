import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { deflateSync } from 'node:zlib'

const width = 1200
const height = 720
const outputDir = path.resolve(import.meta.dir, '..', 'public', 'covers')

type Rgb = [number, number, number]

function crc32(buffer: Uint8Array) {
  let crc = 0xffffffff
  for (const value of buffer) {
    crc ^= value
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array) {
  const typeBytes = Buffer.from(type)
  const output = Buffer.alloc(data.length + 12)
  output.writeUInt32BE(data.length, 0)
  typeBytes.copy(output, 4)
  Buffer.from(data).copy(output, 8)
  output.writeUInt32BE(crc32(Buffer.concat([typeBytes, Buffer.from(data)])), data.length + 8)
  return output
}

function writePng(name: string, pixels: Uint8Array) {
  const scanlines = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 3 + 1)
    scanlines[rowOffset] = 0
    scanlines.set(pixels.subarray(y * width * 3, (y + 1) * width * 3), rowOffset + 1)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
  writeFileSync(path.join(outputDir, name), png)
}

function canvas(fill: Rgb) {
  const pixels = new Uint8Array(width * height * 3)
  for (let i = 0; i < width * height; i += 1) {
    pixels[i * 3] = fill[0]
    pixels[i * 3 + 1] = fill[1]
    pixels[i * 3 + 2] = fill[2]
  }
  return pixels
}

function setPixel(pixels: Uint8Array, x: number, y: number, color: Rgb, alpha = 1) {
  if (x < 0 || y < 0 || x >= width || y >= height) return
  const index = (Math.floor(y) * width + Math.floor(x)) * 3
  pixels[index] = Math.round(pixels[index] * (1 - alpha) + color[0] * alpha)
  pixels[index + 1] = Math.round(pixels[index + 1] * (1 - alpha) + color[1] * alpha)
  pixels[index + 2] = Math.round(pixels[index + 2] * (1 - alpha) + color[2] * alpha)
}

function rect(pixels: Uint8Array, x: number, y: number, w: number, h: number, color: Rgb, alpha = 1) {
  for (let py = Math.max(0, y); py < Math.min(height, y + h); py += 1) {
    for (let px = Math.max(0, x); px < Math.min(width, x + w); px += 1) setPixel(pixels, px, py, color, alpha)
  }
}

function line(
  pixels: Uint8Array,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: Rgb,
  alpha = 1,
  thickness = 1,
) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1))
  for (let i = 0; i <= steps; i += 1) {
    const x = Math.round(x1 + ((x2 - x1) * i) / steps)
    const y = Math.round(y1 + ((y2 - y1) * i) / steps)
    for (let oy = -thickness; oy <= thickness; oy += 1) {
      for (let ox = -thickness; ox <= thickness; ox += 1) setPixel(pixels, x + ox, y + oy, color, alpha)
    }
  }
}

function polygon(pixels: Uint8Array, points: Array<[number, number]>, color: Rgb, alpha = 1) {
  const minY = Math.max(0, Math.floor(Math.min(...points.map((point) => point[1]))))
  const maxY = Math.min(height - 1, Math.ceil(Math.max(...points.map((point) => point[1]))))
  for (let y = minY; y <= maxY; y += 1) {
    const intersections: number[] = []
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i]
      const b = points[(i + 1) % points.length]
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y))
        intersections.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]))
    }
    intersections.sort((a, b) => a - b)
    for (let i = 0; i < intersections.length; i += 2)
      rect(
        pixels,
        Math.round(intersections[i]),
        y,
        Math.max(1, Math.round(intersections[i + 1] - intersections[i])),
        1,
        color,
        alpha,
      )
  }
}

function noise(pixels: Uint8Array, strength: number, seed: number) {
  let state = seed
  for (let index = 0; index < width * height; index += 1) {
    state = (state * 1664525 + 1013904223) >>> 0
    const delta = ((state / 0xffffffff) * 2 - 1) * strength
    pixels[index * 3] = Math.max(0, Math.min(255, pixels[index * 3] + delta))
    pixels[index * 3 + 1] = Math.max(0, Math.min(255, pixels[index * 3 + 1] + delta))
    pixels[index * 3 + 2] = Math.max(0, Math.min(255, pixels[index * 3 + 2] + delta))
  }
}

function rainTerminal() {
  const pixels = canvas([18, 27, 27])
  for (let y = 0; y < height; y += 1)
    rect(pixels, 0, y, width, 1, [18 + y * 0.015, 27 + y * 0.02, 27 + y * 0.015] as Rgb)
  polygon(
    pixels,
    [
      [0, 355],
      [1200, 312],
      [1200, 720],
      [0, 720],
    ],
    [29, 35, 34],
  )
  polygon(
    pixels,
    [
      [0, 525],
      [1200, 450],
      [1200, 720],
      [0, 720],
    ],
    [49, 51, 46],
  )
  line(pixels, 0, 548, 1200, 470, [185, 178, 133], 0.65, 2)
  line(pixels, 0, 646, 1200, 541, [12, 14, 14], 0.9, 4)
  line(pixels, 120, 720, 530, 390, [103, 110, 105], 0.4, 2)
  line(pixels, 1040, 720, 680, 390, [103, 110, 105], 0.4, 2)
  rect(pixels, 570, 235, 630, 255, [34, 52, 49])
  polygon(
    pixels,
    [
      [570, 235],
      [1200, 194],
      [1200, 235],
    ],
    [11, 18, 19],
  )
  for (let x = 615; x < 1160; x += 102) {
    rect(pixels, x, 286, 73, 112, [217, 169, 85], 0.86)
    rect(pixels, x + 8, 294, 57, 96, [91, 75, 48], 0.5)
  }
  rect(pixels, 570, 414, 630, 20, [156, 53, 45], 0.72)
  rect(pixels, 160, 155, 11, 360, [8, 13, 14])
  rect(pixels, 82, 130, 175, 28, [8, 13, 14])
  rect(pixels, 101, 96, 137, 38, [190, 173, 119], 0.56)
  for (let i = 0; i < 360; i += 1) {
    const x = (i * 83 + 19) % width
    const y = (i * 137 + 47) % height
    line(pixels, x, y, x - 12, y + 44, [162, 185, 181], 0.16, 0)
  }
  noise(pixels, 5, 17)
  return pixels
}

function mistLighthouse() {
  const pixels = canvas([126, 145, 145])
  for (let y = 0; y < height; y += 1) {
    const fade = y / height
    rect(pixels, 0, y, width, 1, [126 - 56 * fade, 145 - 60 * fade, 145 - 55 * fade] as Rgb)
  }
  polygon(
    pixels,
    [
      [0, 470],
      [150, 432],
      [285, 455],
      [415, 420],
      [600, 468],
      [760, 440],
      [910, 463],
      [1200, 420],
      [1200, 720],
      [0, 720],
    ],
    [29, 50, 55],
  )
  polygon(
    pixels,
    [
      [0, 560],
      [240, 522],
      [470, 548],
      [700, 512],
      [930, 545],
      [1200, 510],
      [1200, 720],
      [0, 720],
    ],
    [17, 36, 43],
    0.92,
  )
  for (let y = 520; y < 720; y += 34) line(pixels, 0, y, 1200, y - 24, [166, 184, 176], 0.12, 1)
  polygon(
    pixels,
    [
      [745, 510],
      [850, 510],
      [832, 185],
      [764, 185],
    ],
    [214, 211, 190],
  )
  rect(pixels, 750, 165, 96, 35, [31, 42, 42])
  rect(pixels, 765, 132, 67, 39, [179, 73, 53])
  polygon(
    pixels,
    [
      [757, 132],
      [840, 132],
      [812, 104],
      [782, 104],
    ],
    [35, 43, 42],
  )
  polygon(
    pixels,
    [
      [780, 164],
      [0, 330],
      [0, 425],
      [780, 193],
    ],
    [225, 218, 165],
    0.18,
  )
  line(pixels, 797, 104, 797, 54, [39, 47, 46], 1, 2)
  line(pixels, 797, 56, 823, 75, [39, 47, 46], 1, 1)
  for (let i = 0; i < 18; i += 1) {
    const y = 80 + i * 31
    line(pixels, 0, y, 1200, y + ((i % 3) - 1) * 22, [220, 226, 215], 0.055, 8)
  }
  noise(pixels, 4, 29)
  return pixels
}

function tideInn() {
  const pixels = canvas([18, 22, 31])
  for (let y = 0; y < height; y += 1) {
    const fade = y / height
    rect(pixels, 0, y, width, 1, [18 + fade * 22, 22 + fade * 10, 31 + fade * 8] as Rgb)
  }
  polygon(
    pixels,
    [
      [0, 430],
      [180, 400],
      [360, 445],
      [620, 390],
      [880, 430],
      [1200, 380],
      [1200, 720],
      [0, 720],
    ],
    [17, 28, 40],
  )
  polygon(
    pixels,
    [
      [0, 560],
      [260, 530],
      [540, 575],
      [820, 520],
      [1200, 560],
      [1200, 720],
      [0, 720],
    ],
    [12, 20, 28],
    0.92,
  )
  for (let y = 540; y < 720; y += 28) line(pixels, 0, y, 1200, y - 18, [168, 186, 188], 0.08, 1)
  rect(pixels, 690, 248, 310, 250, [48, 32, 29])
  polygon(
    pixels,
    [
      [670, 248],
      [1020, 220],
      [1040, 248],
      [690, 276],
    ],
    [28, 20, 19],
  )
  rect(pixels, 730, 300, 70, 88, [214, 154, 82], 0.88)
  rect(pixels, 820, 312, 62, 78, [196, 122, 64], 0.8)
  rect(pixels, 900, 296, 54, 96, [228, 176, 98], 0.7)
  rect(pixels, 780, 430, 28, 68, [92, 48, 36], 0.85)
  line(pixels, 0, 498, 1200, 470, [214, 196, 148], 0.18, 2)
  for (let i = 0; i < 280; i += 1) {
    const x = (i * 97 + 31) % width
    const y = (i * 151 + 19) % 520
    line(pixels, x, y, x - 10, y + 38, [180, 198, 204], 0.12, 0)
  }
  noise(pixels, 5, 41)
  return pixels
}

function velvetBox() {
  const pixels = canvas([42, 14, 20])
  for (let y = 0; y < height; y += 1) {
    const fade = y / height
    rect(pixels, 0, y, width, 1, [42 - fade * 18, 14 - fade * 6, 20 - fade * 4] as Rgb)
  }
  polygon(
    pixels,
    [
      [180, 720],
      [360, 210],
      [840, 210],
      [1020, 720],
    ],
    [86, 22, 30],
    0.55,
  )
  polygon(
    pixels,
    [
      [250, 720],
      [410, 250],
      [790, 250],
      [950, 720],
    ],
    [18, 10, 14],
    0.45,
  )
  rect(pixels, 430, 286, 340, 210, [28, 16, 18], 0.8)
  polygon(
    pixels,
    [
      [390, 286],
      [810, 286],
      [780, 248],
      [420, 248],
    ],
    [132, 86, 48],
    0.7,
  )
  rect(pixels, 560, 330, 80, 120, [226, 188, 112], 0.55)
  polygon(
    pixels,
    [
      [0, 560],
      [220, 500],
      [480, 575],
      [760, 510],
      [1200, 560],
      [1200, 720],
      [0, 720],
    ],
    [92, 18, 28],
    0.88,
  )
  line(pixels, 140, 430, 1060, 430, [176, 126, 68], 0.35, 3)
  line(pixels, 180, 390, 1020, 390, [176, 126, 68], 0.18, 2)
  for (let i = 0; i < 40; i += 1) {
    const x = 80 + i * 28
    line(pixels, x, 250, x + 18, 720, [160, 40, 48], 0.08, 6)
  }
  noise(pixels, 6, 73)
  return pixels
}

function nightBloom() {
  const pixels = canvas([8, 22, 18])
  for (let y = 0; y < height; y += 1) {
    const fade = y / height
    rect(pixels, 0, y, width, 1, [8 + fade * 10, 22 + fade * 18, 18 + fade * 8] as Rgb)
  }
  for (let x = 70; x < width; x += 118) line(pixels, x, 0, x, height, [146, 186, 160], 0.08, 2)
  for (let y = 60; y < height; y += 92) line(pixels, 0, y, width, y, [146, 186, 160], 0.06, 2)
  polygon(
    pixels,
    [
      [0, 430],
      [260, 360],
      [520, 450],
      [790, 340],
      [1200, 420],
      [1200, 720],
      [0, 720],
    ],
    [14, 46, 34],
    0.85,
  )
  polygon(
    pixels,
    [
      [90, 720],
      [260, 250],
      [310, 248],
      [430, 720],
    ],
    [18, 58, 40],
    0.75,
  )
  polygon(
    pixels,
    [
      [760, 720],
      [880, 210],
      [940, 208],
      [1120, 720],
    ],
    [16, 52, 38],
    0.7,
  )
  polygon(
    pixels,
    [
      [500, 430],
      [590, 310],
      [680, 430],
      [640, 520],
      [540, 520],
    ],
    [232, 214, 176],
    0.72,
  )
  polygon(
    pixels,
    [
      [540, 390],
      [590, 250],
      [640, 390],
    ],
    [240, 228, 196],
    0.55,
  )
  rect(pixels, 470, 430, 50, 90, [214, 164, 72], 0.35)
  for (let i = 0; i < 90; i += 1) {
    const x = 80 + ((i * 127) % 1040)
    const y = 40 + ((i * 83) % 280)
    setPixel(pixels, x, y, [210, 230, 214], 0.25)
  }
  noise(pixels, 4, 11)
  return pixels
}

function forgottenRescue() {
  const pixels = canvas([24, 22, 28])
  for (let y = 0; y < height; y += 1) {
    const fade = y / height
    rect(pixels, 0, y, width, 1, [24 + fade * 18, 22 + fade * 8, 28 + fade * 6] as Rgb)
  }
  rect(pixels, 0, 0, 430, height, [16, 18, 24], 0.72)
  for (let y = 0; y < height; y += 18) line(pixels, 0, y, 430, y + 6, [88, 110, 124], 0.08, 1)
  rect(pixels, 520, 160, 520, 430, [46, 32, 30])
  polygon(
    pixels,
    [
      [520, 160],
      [1040, 130],
      [1040, 160],
      [520, 190],
    ],
    [28, 20, 20],
  )
  rect(pixels, 590, 230, 110, 150, [214, 168, 98], 0.82)
  rect(pixels, 760, 250, 90, 130, [186, 128, 78], 0.7)
  rect(pixels, 900, 220, 70, 160, [228, 186, 120], 0.45)
  polygon(
    pixels,
    [
      [680, 430],
      [740, 310],
      [790, 430],
      [770, 560],
      [700, 560],
    ],
    [92, 48, 42],
    0.75,
  )
  polygon(
    pixels,
    [
      [790, 450],
      [860, 330],
      [910, 460],
      [880, 590],
      [800, 580],
    ],
    [62, 36, 34],
    0.7,
  )
  rect(pixels, 140, 470, 150, 18, [168, 148, 120], 0.55)
  for (let i = 0; i < 220; i += 1) {
    const x = (i * 89 + 13) % 430
    const y = (i * 131 + 27) % height
    line(pixels, x, y, x - 8, y + 30, [176, 196, 204], 0.14, 0)
  }
  noise(pixels, 5, 53)
  return pixels
}

function qinZhixu() {
  const pixels = canvas([28, 22, 24])
  for (let y = 0; y < height; y += 1) {
    const fade = y / height
    rect(pixels, 0, y, width, 1, [28 + fade * 16, 22 + fade * 6, 24 + fade * 4] as Rgb)
  }
  rect(pixels, 90, 80, 430, 560, [18, 16, 18], 0.9)
  for (let y = 120; y < 600; y += 46) line(pixels, 110, y, 500, y, [48, 40, 42], 0.35, 1)
  rect(pixels, 620, 140, 460, 430, [52, 28, 30])
  polygon(
    pixels,
    [
      [620, 140],
      [1080, 110],
      [1080, 140],
      [620, 170],
    ],
    [32, 18, 20],
  )
  rect(pixels, 700, 210, 90, 140, [214, 176, 112], 0.55)
  rect(pixels, 860, 230, 70, 120, [168, 92, 72], 0.4)
  polygon(
    pixels,
    [
      [790, 520],
      [860, 280],
      [920, 520],
      [890, 620],
      [810, 620],
    ],
    [36, 20, 22],
    0.8,
  )
  for (let i = 0; i < 24; i += 1) {
    const x = 760 + (i % 8) * 18
    const y = 180 + Math.floor(i / 8) * 26
    setPixel(pixels, x, y, [210, 196, 176], 0.28)
  }
  line(pixels, 840, 250, 980, 160, [196, 186, 170], 0.18, 8)
  noise(pixels, 5, 67)
  return pixels
}

mkdirSync(outputDir, { recursive: true })
writePng('rain-terminal.png', rainTerminal())
writePng('mist-lighthouse.png', mistLighthouse())
writePng('tide-inn.png', tideInn())
writePng('velvet-box.png', velvetBox())
writePng('night-bloom.png', nightBloom())
writePng('forgotten-rescue.png', forgottenRescue())
writePng('qin-zhixu.png', qinZhixu())
console.log('Generated story cover PNGs.')
