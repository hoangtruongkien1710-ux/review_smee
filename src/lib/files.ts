import "server-only";
import { abs, mediaDir, removeQuiet } from "./storage";

/** Xoá file của các phiên bản trên ổ VPS (bản xem, thumbnail, file gốc còn giữ tạm). */
export function removeVersionFiles(versions: { id: string; originalKey: string | null }[]) {
  for (const v of versions) {
    removeQuiet(mediaDir(v.id));
    if (v.originalKey) {
      try {
        removeQuiet(abs(v.originalKey));
      } catch {
        /* bỏ qua */
      }
    }
  }
}
