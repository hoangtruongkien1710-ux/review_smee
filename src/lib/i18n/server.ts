import "server-only";
import { cookies } from "next/headers";
import { LANG_COOKIE, isLang, makeT, type Lang } from "./index";

/** Ngôn ngữ của khách: mặc định tiếng Việt, khách tự chọn ngôn ngữ khác (nhớ bằng cookie). */
export async function guestLang(): Promise<Lang> {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(c) ? c : "vi";
}

export async function guestT() {
  const lang = await guestLang();
  return { lang, t: makeT(lang) };
}
