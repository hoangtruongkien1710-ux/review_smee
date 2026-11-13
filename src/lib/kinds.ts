// Nhận diện loại file theo đuôi / mime. Dùng được cả ở server và trình duyệt.
export type Kind = "VIDEO" | "AUDIO" | "IMAGE" | "PDF" | "DOCUMENT" | "OTHER";

const EXT: Record<string, Kind> = {};
const add = (k: Kind, list: string) => list.split(" ").forEach((e) => (EXT[e] = k));
add("VIDEO", "mp4 m4v mov qt mxf avi mkv webm wmv mpg mpeg mts m2ts ts 3gp flv prores r3d braw");
add("AUDIO", "mp3 wav m4a aac flac ogg oga opus wma aif aiff");
add("IMAGE", "jpg jpeg png gif webp avif bmp tif tiff heic heif psd svg");
add("PDF", "pdf");
add("DOCUMENT", "doc docx odt rtf txt xls xlsx ods csv ppt pptx odp key pages numbers");

export function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function kindOf(name: string, mime = ""): Kind {
  const e = EXT[extOf(name)];
  if (e) return e;
  if (mime.startsWith("video/")) return "VIDEO";
  if (mime.startsWith("audio/")) return "AUDIO";
  if (mime.startsWith("image/")) return "IMAGE";
  if (mime === "application/pdf") return "PDF";
  return "OTHER";
}

export const KIND_LABEL: Record<Kind, string> = {
  VIDEO: "Video",
  AUDIO: "Audio",
  IMAGE: "Ảnh",
  PDF: "PDF",
  DOCUMENT: "Tài liệu",
  OTHER: "File",
};

// Ảnh trình duyệt hiển thị trực tiếp được (không cần chuyển đổi)
export const WEB_IMAGE_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif", "svg", "bmp"]);
