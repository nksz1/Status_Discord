# Neko Discord Uptime Dashboard

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-5.2-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/nksz1/status_discord/ci.yml?branch=main&style=for-the-badge&label=CI)](https://github.com/nksz1/status_discord/actions/workflows/ci.yml)

Hệ thống Dashboard giám sát và hiển thị trạng thái hoạt động công khai dành cho toàn bộ hệ sinh thái Discord bot của Neko Studio. Ứng dụng hoạt động theo cơ chế aggregator độc lập: định kỳ thu thập chỉ số nội bộ qua kênh xác thực an toàn, tự động suy luận mức độ ảnh hưởng dịch vụ (Impact State) và cung cấp giao diện trực quan cho cộng đồng mà không kết nối trực tiếp tới Discord Gateway.

---

## Mục lục

- [Kiến trúc hệ thống](#kiến-trúc-hệ-thống)
- [Bảng trạng thái Impact](#bảng-trạng-thái-impact)
- [Yêu cầu môi trường](#yêu-cầu-môi-trường)
- [Cài đặt & Cấu hình](#cài-đặt--cấu-hình)
  - [1. Cấu hình danh sách bot (`bots.config.json`)](#1-cấu-hình-danh-sách-bot-botsconfigjson)
  - [2. Biến môi trường bảo mật (`.env`)](#2-biến-môi-trường-bảo-mật-env)
  - [3. Biến môi trường ứng dụng (`.env.local`)](#3-biến-môi-trường-ứng-dụng-envlocal)
- [Lệnh thực thi](#lệnh-thực-thi)
- [Cam kết & Tiêu chuẩn bảo mật](#cam-kết--tiêu-chuẩn-bảo-mật)

---

## Kiến trúc hệ thống

Dự án tách biệt hoàn toàn giữa luồng giám sát nội bộ (Private Aggregator) và luồng hiển thị công khai (Public Client):

```text
+-----------------------------------------------------------------------------------+
|                           MẠNG NỘI BỘ (PRIVATE NETWORK)                           |
|                                                                                   |
|  +--------------------+        +--------------------+                             |
|  | Discord Bot Alpha  |        | Discord Bot Beta   |   ... (Các dịch vụ bot)     |
|  | (Internal Metrics) |        | (Internal Metrics) |                             |
|  +---------+----------+        +---------+----------+                             |
|            ^                             ^                                        |
|            | Bearer Token A              | Bearer Token B                         |
|            | (Timeout: 6s / Max: 64KB)   | (Timeout: 6s / Max: 64KB)              |
|            +--------------+--------------+                                        |
|                           | (Polling định kỳ mỗi 3 giây)                          |
|            +--------------v--------------+                                        |
|            |      Backend Aggregator     |                                        |
|            |      (Express 5 / Node ESM) |                                        |
|            |  - Đọc bots.config.json     |                                        |
|            |  - Chuẩn hóa Payload        |                                        |
|            |  - Tính toán Public Impact  |                                        |
|            |  - Quản lý Sự cố (Incident) |                                        |
|            +-------+--------------+------+                                        |
|                    |              |                                               |
|       Ghi định kỳ  |              | Lưu trữ / Khôi phục                           |
|       (mỗi 2 phút) v              v                                               |
|             +--------------+------+                                               |
|             |        data.json    | (Lưu vết 30 ngày lịch sử / 7 ngày sự cố)      |
|             +---------------------+                                               |
+-----------------------------------------------------------------------------------+
                                    |
                    Sanitized DTO   | GET /api/status
                    (Rate-limited)  | (Cache 5s / Allowlist schema)
                                    v
+-----------------------------------------------------------------------------------+
|                           MẠNG CÔNG KHAI (PUBLIC INTERNET)                        |
|                                                                                   |
|             +------------------------------------+                                |
|             |      React 19 Frontend (Vite 6)    |                                |
|             |  - Tự động làm mới mỗi 30 giây     |                                |
|             |  - Hiển thị Thẻ trạng thái & Ping  |                                |
|             |  - Thanh biểu đồ Uptime lịch sử    |                                |
|             |  - Trạng thái từng tính năng       |                                |
|             +------------------------------------+                                |
+-----------------------------------------------------------------------------------+
```

> **Lưu ý**: Repository này **không** chứa mã nguồn bot Discord, không lắng nghe Discord gateway events, không xử lý slash commands và không yêu cầu Discord Bot Token.

---

## Bảng trạng thái Impact

Backend tự động phân tích các tín hiệu kỹ thuật (`status`, `latencyMs`, `liveData`) từ snapshot nội bộ để suy luận mức độ ảnh hưởng thực tế đến người dùng cuối:

| Trạng thái | Tên hiển thị | Ý nghĩa & Điều kiện kích hoạt |
|---|---|---|
| `normal` | **Hoạt động tốt** | Dịch vụ phản hồi bình thường, dữ liệu trực tiếp sẵn sàng, độ trễ nằm dưới ngưỡng cảnh báo (`latencySlowMs`). |
| `slow` | **Phản hồi chậm** | Dịch vụ vẫn trực tuyến (`online`) nhưng độ trễ vượt ngưỡng `latencySlowMs` liên tục trong khoảng thời gian ân hạn (`slowGraceMs`). |
| `interrupted` | **Gián đoạn** | Dịch vụ báo lỗi (`error`), mất kết nối (`offline`) hoặc mất tín hiệu dữ liệu sống (`liveData = false`) kéo dài vượt quá `interruptionGraceMs`. Một sự cố (Incident) sẽ tự động được ghi nhận. |
| `checking` | **Đang kiểm tra** | Trạng thái đệm khi bot vừa có dấu hiệu mất tín hiệu hoặc đang kết nối lại. Hệ thống duy trì trạng thái này trong thời gian ân hạn trước khi xác nhận gián đoạn, tránh báo động giả do mạng chập chờn tức thời. |
| `recovering` | **Đang hồi phục** | Dịch vụ vừa trở lại trạng thái bình thường sau sự cố. Hệ thống giữ bot trong trạng thái theo dõi suốt cửa sổ `recoveringWindowMs` (mặc định 15 phút) trước khi chính thức chuyển về `normal`. |

---

## Yêu cầu môi trường

- **Node.js**: Phiên bản `18.0.0` trở lên (hỗ trợ native ESM và fetch API).
- **Trình quản lý gói**: `npm` (đi kèm `package-lock.json`).

---

## Cài đặt & Cấu hình

### 1. Cấu hình danh sách bot (`bots.config.json`)

Tạo hoặc chỉnh sửa file `bots.config.json` tại thư mục gốc của dự án để khai báo danh sách dịch vụ và tham số ngưỡng:

```json
{
  "defaults": {
    "latencySlowMs": 800,
    "slowGraceMs": 9000,
    "interruptionGraceMs": 30000,
    "recoveringWindowMs": 900000
  },
  "bots": [
    {
      "id": "bot-service-alpha",
      "label": "Bot Dịch Vụ Alpha",
      "url": "http://internal-bot-1.local:25000/api/uptime/status",
      "tokenEnv": "UPTIME_TOKEN_BOT_ALPHA",
      "latencySlowMs": 600,
      "features": [
        { "id": "general-commands", "label": "Lệnh cơ bản" },
        { "id": "ticket-system", "label": "Hệ thống hỗ trợ" }
      ]
    },
    {
      "id": "bot-service-beta",
      "label": "Bot Dịch Vụ Beta",
      "url": "http://internal-bot-2.local:25001/api/uptime/status",
      "tokenEnv": "UPTIME_TOKEN_BOT_BETA",
      "features": [
        { "id": "economy", "label": "Hệ thống kinh tế" },
        { "id": "minigames", "label": "Minigame" }
      ]
    }
  ]
}
```

**Giải thích các tham số:**
- `defaults`:
  - `latencySlowMs` *(number)*: Ngưỡng độ trễ (ms) để bắt đầu tính thời gian chậm (mặc định: `800`). Có thể ghi đè riêng cho từng bot.
  - `slowGraceMs` *(number)*: Thời gian duy trì độ trễ cao liên tục trước khi công bố trạng thái `slow` (mặc định: `9000` - 9 giây).
  - `interruptionGraceMs` *(number)*: Thời gian mất tín hiệu liên tục trước khi công bố trạng thái `interrupted` (mặc định: `30000` - 30 giây).
  - `recoveringWindowMs` *(number)*: Thời gian theo dõi phục hồi sau sự cố trước khi đưa về `normal` (mặc định: `900000` - 15 phút).
- `bots[]`:
  - `id` *(string)*: Mã định danh dịch vụ (chuẩn hóa kebab-case).
  - `label` *(string)*: Tên hiển thị công khai trên giao diện.
  - `url` *(string)*: Địa chỉ endpoint uptime nội bộ của bot (yêu cầu chuẩn hóa JSON).
  - `tokenEnv` *(string)*: Tên biến môi trường trong `.env` chứa Bearer token xác thực của bot đó.
  - `features[]` *(array)*: Danh sách tính năng thành phần để hiển thị tình trạng chi tiết cho người dùng.

---

### 2. Biến môi trường bảo mật (`.env`)

File `.env` lưu trữ các token xác thực máy chủ và cấu hình bảo vệ tầng mạng. **Tuyệt đối không commit file này lên Git.**

```bash
# Token xác thực nội bộ tương ứng với từng bot (tối thiểu 32 ký tự, khuyến nghị hex 64 ký tự ngẫu nhiên)
UPTIME_TOKEN_BOT_ALPHA=<YOUR_BEARER_TOKEN_64_HEX_1>
UPTIME_TOKEN_BOT_BETA=<YOUR_BEARER_TOKEN_64_HEX_2>

# Giới hạn tần suất gọi API công khai (Rate Limiting cho GET /api/status)
PUBLIC_STATUS_RATE_LIMIT_MAX=60
PUBLIC_STATUS_RATE_LIMIT_WINDOW_MS=60000

# Cấu hình tuỳ chọn CORS và Proxy
PUBLIC_CORS_ORIGIN=
TRUST_PROXY_HOPS=0
```

---

### 3. Biến môi trường ứng dụng (`.env.local`)

File `.env.local` định cấu hình cổng chạy server và các tham số cho giao diện người dùng:

```bash
# Cổng lắng nghe của Backend Aggregator
SERVER_PORT=25133

# Đường dẫn API công khai cho Client (khuyến nghị giữ /api/status khi chạy chung Express)
VITE_API_URL=/api/status

# Chế độ debug cho Client (true để hiển thị raw public payload)
VITE_SHOW_DEBUG=false

# (Tuỳ chọn) Danh sách endpoint fallback nếu không tìm thấy bots.config.json
# BOT_ENDPOINTS=Bot Alpha|http://internal-bot-1.local:25000/api/uptime/status
```

---

## Lệnh thực thi

Dự án cung cấp đầy đủ các kịch bản thực thi phục vụ từ khâu phát triển đến triển khai sản xuất:

| Lệnh | Mục đích | Chi tiết hoạt động |
|---|---|---|
| `npm run dev` | Toàn bộ môi trường Dev | Sử dụng `concurrently` chạy đồng thời cả Frontend (Vite) và Backend (`tsx server/index.ts`). |
| `npm run dev:frontend` | Phát triển giao diện | Chỉ chạy Vite dev server (bind `0.0.0.0`, cấu hình sẵn reverse proxy `/api` sang backend). |
| `npm run dev:backend` | Phát triển backend | Chỉ khởi chạy aggregator backend với `tsx` để thăm dò các bot và cập nhật `data.json`. |
| `npm run build` | Biên dịch Production | Kiểm tra kiểu dữ liệu TypeScript (`tsc -b`) và đóng gói giao diện React vào thư mục `dist/`. |
| `npm start` | Khởi chạy Production | Khởi chạy Express server: định kỳ poll bot, phục vụ API `/api/status` và serve file tĩnh từ `dist/`. |
| `node index.js` | Launcher tương thích | Script khởi chạy tương thích chuyển tiếp gọi tới `npm start`. |

---

## Cam kết & Tiêu chuẩn bảo mật

Hệ thống được thiết kế theo nguyên tắc phòng vệ chuyên sâu (**Defense in Depth**), tuân thủ các quy chuẩn bảo mật nghiêm ngặt:

1. **Zero-Knowledge tại Client**:
   - Giao diện người dùng (React) không bao giờ nhận biết hoặc tiếp xúc với địa chỉ URL gốc, IP, Port hay Token xác thực của các bot nội bộ.
   - Frontend chỉ gửi yêu cầu duy nhất tới endpoint tổng hợp `/api/status`.
2. **Cô lập thông tin xác thực (Credential Isolation)**:
   - Toàn bộ Bearer Token chỉ lưu trữ trong biến môi trường server (`.env`).
   - Tuyệt đối không đặt token trong các biến tiền tố `VITE_*` (tránh rò rỉ vào bundle JavaScript của trình duyệt).
3. **Bộ lọc dữ liệu nghiêm ngặt (Strict Allowlist Sanitization)**:
   - Dữ liệu trả về qua hàm `toPublicBotSnapshot` được whitelist hóa rõ ràng: loại bỏ hoàn toàn dấu vết hạ tầng, lỗi thô (stack trace), host/port, guild count và bot ID/tags.
4. **Phòng chống lạm dụng & từ chối dịch vụ (DoS Protection)**:
   - Backend giới hạn kích thước phản hồi tối đa từ bot ở mức **64 KiB** và hủy yêu cầu (abort) sau **6 giây** timeout.
   - Từ chối mọi chuyển hướng HTTP (`redirect: "error"`).
   - Tích hợp bộ đếm tần suất truy cập theo địa chỉ IP (Rate Limiter) tại API công khai kèm theo HTTP header chuẩn (`X-RateLimit-*`, `Retry-After`).
