import "server-only";
import { cookies, headers } from "next/headers";
import { LANG_COOKIE, isLang, makeT, pickLang, type Lang } from "./index";

/** Ngôn ngữ của khách: cookie đã chọn, nếu chưa thì theo trình duyệt. */
export async function guestLang(): Promise<Lang> {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  if (isLang(c)) return c;
  return pickLang((await headers()).get("accept-language"));
}

export async function guestT() {
  const lang = await guestLang();
  return { lang, t: makeT(lang) };
}
