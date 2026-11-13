import "server-only";
// Ghi file ZIP dạng luồng (không nén, vì video/ảnh đã nén sẵn), hỗ trợ ZIP64 cho file và tổng dung lượng trên 4 GB.
// Không cần chứa cả file zip trong RAM hay trên ổ đĩa: đọc tới đâu gửi cho khách tới đó.
import zlib from "node:zlib";

export type ZipEntry = {
  /** đường dẫn trong file zip, ví dụ "Thư mục/Con/video.mp4" */
  name: string;
  date?: Date;
  /** mở luồng dữ liệu khi tới lượt file này; trả về null để bỏ qua file */
  open: () => Promise<AsyncIterable<Uint8Array> | null>;
};

const MAX32 = 0xffffffff;

function dosTime(d: Date) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

/** Tên file an toàn trong zip: bỏ ký tự cấm, không cho đi ngược thư mục. */
export function zipSafe(part: string) {
  const s = part.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").replace(/^\.+$/, "_").trim();
  return s || "_";
}

/** Tạo luồng ZIP từ danh sách file. */
export function zipStream(entries: ZipEntry[]): ReadableStream<Uint8Array> {
  async function* gen() {
    const central: Buffer[] = [];
    let offset = 0n;
    let count = 0;
    for (const e of entries) {
      const src = await e.open().catch(() => null);
      if (!src) continue;
      const name = Buffer.from(e.name, "utf8");
      const { time, date } = dosTime(e.date ?? new Date());
      const start = offset;

      // Local file header: kích thước chưa biết → ghi sau ở data descriptor (bit 3), tên UTF-8 (bit 11)
      const lh = Buffer.alloc(30 + name.length + 20);
      lh.writeUInt32LE(0x04034b50, 0);
      lh.writeUInt16LE(45, 4);
      lh.writeUInt16LE(0x0808, 6);
      lh.writeUInt16LE(0, 8);
      lh.writeUInt16LE(time, 10);
      lh.writeUInt16LE(date, 12);
      lh.writeUInt32LE(0, 14);
      lh.writeUInt32LE(MAX32, 18);
      lh.writeUInt32LE(MAX32, 22);
      lh.writeUInt16LE(name.length, 26);
      lh.writeUInt16LE(20, 28);
      name.copy(lh, 30);
      lh.writeUInt16LE(0x0001, 30 + name.length); // ZIP64 extra (kích thước 0, thật nằm ở descriptor)
      lh.writeUInt16LE(16, 32 + name.length);
      yield lh;
      offset += BigInt(lh.length);

      let crc = 0;
      let size = 0n;
      for await (const chunk of src) {
        const b = chunk instanceof Buffer ? chunk : Buffer.from(chunk);
        crc = zlib.crc32(b, crc);
        size += BigInt(b.length);
        yield b;
      }
      offset += size;

      const dd = Buffer.alloc(24);
      dd.writeUInt32LE(0x08074b50, 0);
      dd.writeUInt32LE(crc >>> 0, 4);
      dd.writeBigUInt64LE(size, 8);
      dd.writeBigUInt64LE(size, 16);
      yield dd;
      offset += 24n;

      // + Info-ZIP Unicode Path (0x7075) để Windows Explorer cũ vẫn hiện đúng tên tiếng Việt
      const up = 9 + name.length;
      const ch = Buffer.alloc(46 + name.length + 28 + 4 + up);
      ch.writeUInt32LE(0x02014b50, 0);
      ch.writeUInt16LE(45, 4);
      ch.writeUInt16LE(45, 6);
      ch.writeUInt16LE(0x0808, 8);
      ch.writeUInt16LE(0, 10);
      ch.writeUInt16LE(time, 12);
      ch.writeUInt16LE(date, 14);
      ch.writeUInt32LE(crc >>> 0, 16);
      ch.writeUInt32LE(MAX32, 20);
      ch.writeUInt32LE(MAX32, 24);
      ch.writeUInt16LE(name.length, 28);
      ch.writeUInt16LE(28 + 4 + up, 30);
      ch.writeUInt16LE(0, 32);
      ch.writeUInt16LE(0, 34);
      ch.writeUInt16LE(0, 36);
      ch.writeUInt32LE(0, 38);
      ch.writeUInt32LE(MAX32, 42);
      name.copy(ch, 46);
      const x = 46 + name.length;
      ch.writeUInt16LE(0x0001, x);
      ch.writeUInt16LE(24, x + 2);
      ch.writeBigUInt64LE(size, x + 4);
      ch.writeBigUInt64LE(size, x + 12);
      ch.writeBigUInt64LE(start, x + 20);
      ch.writeUInt16LE(0x7075, x + 28);
      ch.writeUInt16LE(up, x + 30);
      ch.writeUInt8(1, x + 32);
      ch.writeUInt32LE(zlib.crc32(name) >>> 0, x + 33);
      name.copy(ch, x + 37);
      central.push(ch);
      count++;
    }

    const cdStart = offset;
    let cdSize = 0n;
    for (const c of central) {
      yield c;
      cdSize += BigInt(c.length);
    }
    const z64 = Buffer.alloc(56 + 20);
    z64.writeUInt32LE(0x06064b50, 0);
    z64.writeBigUInt64LE(44n, 4);
    z64.writeUInt16LE(45, 12);
    z64.writeUInt16LE(45, 14);
    z64.writeUInt32LE(0, 16);
    z64.writeUInt32LE(0, 20);
    z64.writeBigUInt64LE(BigInt(count), 24);
    z64.writeBigUInt64LE(BigInt(count), 32);
    z64.writeBigUInt64LE(cdSize, 40);
    z64.writeBigUInt64LE(cdStart, 48);
    z64.writeUInt32LE(0x07064b50, 56);
    z64.writeUInt32LE(0, 60);
    z64.writeBigUInt64LE(cdStart + cdSize, 64);
    z64.writeUInt32LE(1, 72);
    yield z64;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0xffff, 8);
    end.writeUInt16LE(0xffff, 10);
    end.writeUInt32LE(MAX32, 12);
    end.writeUInt32LE(MAX32, 16);
    yield end;
  }

  const it = gen();
  return new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      try {
        const r = await it.next();
        if (r.done) ctrl.close();
        else ctrl.enqueue(new Uint8Array(r.value.buffer, r.value.byteOffset, r.value.byteLength));
      } catch (e) {
        ctrl.error(e);
      }
    },
    async cancel() {
      await it.return?.(undefined);
    },
  });
}
