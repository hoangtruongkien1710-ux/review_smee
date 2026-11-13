/**
 * Smee Review – cho phép app upload file gốc vào Google Drive của bạn.
 *
 * Cách dùng (xem thêm docs/google-drive.md, mục "Cách 0"):
 *  1. Mở https://script.google.com bằng tài khoản CHỦ thư mục APP_SMEE_REVIEW → Dự án mới.
 *  2. Xoá hết mã có sẵn, dán toàn bộ file này vào. Đổi SECRET bên dưới thành một chuỗi dài bất kỳ.
 *  3. Chọn hàm "setup" → bấm Chạy → cho phép quyền truy cập Google Drive.
 *  4. Triển khai → Tuỳ chọn triển khai mới → Loại: Ứng dụng web
 *       Thực thi với tư cách: Tôi
 *       Người có quyền truy cập: Bất kỳ ai
 *     → Triển khai → copy "URL ứng dụng web" (kết thúc bằng /exec).
 *  5. Trong file .env của app:
 *       GOOGLE_APPS_SCRIPT_URL=<URL ở bước 4>
 *       GOOGLE_APPS_SCRIPT_KEY=<SECRET ở bước 2>
 *
 * Bảo mật: ai có cả URL lẫn SECRET thì dùng được Drive của tài khoản này.
 * Không gửi SECRET qua chat, không đưa lên Git. Muốn thu hồi: đổi SECRET (rồi triển khai lại) hoặc xoá bản triển khai.
 */

const SECRET = 'DOI-CHUOI-NAY-THANH-MA-BI-MAT-DAI-CUA-BAN';

function doGet(e) {
  const key = e && e.parameter ? e.parameter.key : '';
  if (!SECRET || SECRET.indexOf('DOI-CHUOI-NAY') === 0 || key !== SECRET) {
    return json_({ error: 'Sai mã bí mật' });
  }
  return json_({ access_token: ScriptApp.getOAuthToken(), expires_in: 3000 });
}

/** Chạy một lần để Google hỏi quyền Drive, và kiểm tra thư mục. */
function setup() {
  const root = DriveApp.getRootFolder();
  Logger.log('Đã cấp quyền Drive cho: ' + Session.getActiveUser().getEmail() + ' (' + root.getName() + ')');
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
