# Neko Discord Uptime Dashboard

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-5.2-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/nksz1/status_discord/ci.yml?branch=main&style=for-the-badge&label=CI)](https://github.com/nksz1/status_discord/actions/workflows/ci.yml)

---

## Mục lục

- [Giới thiệu (Overview)](#giới-thiệu-overview)
- [Kiến trúc hệ thống (Architecture)](#kiến-trúc-hệ-thống-architecture)
- [Bảng trạng thái Impact](#bảng-trạng-thái-impact)
- [Cấu trúc thư mục (Project Structure)](#cấu-trúc-thư-mục-project-structure)
- [Yêu cầu môi trường (Prerequisites)](#yêu-cầu-môi-trường-prerequisites)
- [Tải xuống & Cài đặt (Installation)](#tải-xuống--cài-đặt-installation)
- [Khởi chạy nhanh (Quick Start)](#khởi-chạy-nhanh-quick-start)
- [Cấu hình chi tiết (Configuration)](#cấu-hình-chi-tiết-configuration)
  - [1. Danh sách dịch vụ (`bots.config.json`)](#1-danh-sách-dịch-vụ-botsconfigjson)
  - [2. Biến môi trường bảo mật (`.env`)](#2-biến-môi-trường-bảo-mật-env)
  - [3. Biến môi trường ứng dụng (`.env.local`)](#3-biến-môi-trường-ứng-dụng-envlocal)
- [Danh mục lệnh thực thi (Available Scripts)](#danh-mục-lệnh-thực-thi-available-scripts)
- [Cam kết & Tiêu chuẩn bảo mật (Security & Defense in Depth)](#cam-kết--tiêu-chuẩn-bảo-mật-security--defense-in-depth)
- [English Quick Start Guide](#english-quick-start-guide)
- [Đóng góp & Giấy phép (Contributing & License)](#đóng-góp--giấy-phép-contributing--license)

---

## Giới thiệu (Overview)

**Neko Discord Uptime Dashboard** là hệ thống giám sát và hiển thị trạng thái hoạt động công khai dành cho toàn bộ hệ sinh thái Discord bot của Neko Studio. Ứng dụng vận hành theo cơ chế backend aggregator độc lập: định kỳ thăm dò (poll) các endpoint HTTP nội bộ của từng dịch vụ bot thông qua Bearer token riêng biệt, tự động suy luận mức độ ảnh hưởng dịch vụ (Impact State), duy trì lịch sử theo thời gian và cung cấp API đã được chuẩn hóa an toàn (`GET /api/status`) cho giao diện người dùng React hiện đại.

> **Lưu ý cốt lõi**: Dự án này **hoàn toàn không** chứa mã nguồn bot Discord, không kết nối Discord Gateway, không lắng nghe sự kiện, không xử lý slash commands và không yêu cầu Discord bot token. Dashboard đóng vai trò là tầng quan sát và minh bạch trạng thái độc lập, tách biệt hoàn toàn giữa hạ tầng bot nội bộ và cộng đồng người dùng công khai.

---

## Kiến trúc hệ thống (Architecture)

Hệ thống được thiết kế phân tách ranh giới bảo mật nghiêm ngặt giữa **Mạng nội bộ (Private Network)** và **Mạng công khai (Public Internet)**:

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

### Nguyên lý vận hành của luồng dữ liệu
1. **Aggregator Polling**: Backend chạy nền định kỳ mỗi 3 giây (`POLL_INTERVAL_MS = 3000`), gửi request kèm Bearer token tới từng bot endpoint để thu thập snapshot kỹ thuật.
2. **Impact Inference & Persistence**: Backend phân tích chỉ số độ trễ, dữ liệu sống (`liveData`) và trạng thái kết nối để tính toán mức độ ảnh hưởng (Impact State). Dữ liệu lịch sử được ghi định kỳ mỗi 2 phút vào file JSON (`data.json`) qua cơ chế ghi nguyên tử (atomic write). Hệ thống tự động lưu giữ lịch sử trong 30 ngày và sự cố trong 7 ngày.
3. **Public API Gateway**: Endpoint `GET /api/status` áp dụng bộ lọc allowlist khắt khe, loại bỏ mọi thông tin nhạy cảm (URL, port, tokens, stack trace), lưu cache phản hồi trong 5 giây và giới hạn tần suất truy cập theo IP.
4. **Client Consumption**: Ứng dụng React 19 trên trình duyệt tự động cập nhật dữ liệu mỗi 30 giây một lần với cơ chế ngăn chặn gửi yêu cầu trùng lặp (single-flight request guard).

---

## Bảng trạng thái Impact

Backend tự động phân tích các thuộc tính kỹ thuật nội bộ (`status`, `latencyMs`, `liveData`) để xác định 1 trong 5 trạng thái ảnh hưởng công khai (Public Impact):

| Trạng thái | Tên hiển thị | Điều kiện kích hoạt & Ý nghĩa vận hành |
|---|---|---|
| `normal` | **Hoạt động tốt** | Dịch vụ trực tuyến bình thường (`status = "online"`), dữ liệu trực tiếp sẵn sàng (`liveData = true`) và độ trễ phản hồi nằm dưới ngưỡng `latencySlowMs` (mặc định: `800ms`). |
| `slow` | **Phản hồi chậm** | Dịch vụ vẫn trực tuyến (`status = "online"`) nhưng độ trễ phản hồi vượt ngưỡng `latencySlowMs` liên tục trong khoảng thời gian ân hạn `slowGraceMs` (mặc định: `9000ms` / 9 giây). |
| `interrupted` | **Gián đoạn** | Dịch vụ báo lỗi (`status = "error"`), mất kết nối (`status = "offline"`) hoặc mất tín hiệu trực tiếp (`liveData = false`) kéo dài vượt quá khoảng thời gian ân hạn `interruptionGraceMs` (mặc định: `30000ms` / 30 giây). Một sự cố mới (`PublicIncident`) sẽ tự động được ghi nhận. |
| `checking` | **Đang kiểm tra** | Trạng thái đệm tức thời khi bot vừa phát sinh tín hiệu bất thường (`status = "connecting"` hoặc mất `liveData`). Hệ thống duy trì trạng thái này trong thời gian ân hạn trước khi chuyển sang `interrupted`, giúp triệt tiêu báo động giả do mạng nội bộ chập chờn nhất thời. |
| `recovering` | **Đang hồi phục** | Dịch vụ vừa khôi phục trạng thái hoạt động bình thường sau sự cố hoặc gián đoạn. Hệ thống giữ dịch vụ trong trạng thái theo dõi suốt cửa sổ `recoveringWindowMs` (mặc định: `900000ms` / 15 phút) trước khi chính thức đưa về `normal`. |

---

## Cấu trúc thư mục (Project Structure)

```text
neko-discord-uptime-dashboard/
├── .codex/                 # Tài liệu ngữ cảnh dự án nội bộ
├── public/                 # Tài nguyên tĩnh phía client được Vite đóng gói trực tiếp
│   └── Elaina.mp4          # Video phông nền giao diện dashboard
├── server/                 # Tầng Backend Aggregator & Express Server
│   ├── db.ts               # Bộ nhớ đệm in-memory backed by data.json qua atomic write (data.json.tmp)
│   ├── index.ts            # Entry point backend: Polling loop, Impact logic, API, static serving
│   └── uptime.ts           # HTTP client thăm dò bot nội bộ với Bearer token (timeout 6s, max 64KiB)
├── src/                    # Mã nguồn Frontend React 19 (Vite, TypeScript)
│   ├── services/
│   │   └── uptime.ts       # Module gọi API GET /api/status từ trình duyệt
│   ├── App.tsx             # Giao diện chính: Thẻ trạng thái, thanh lịch sử, sự cố, debug view
│   ├── NotFound.tsx        # Trang điều hướng lỗi 404 cho giao diện
│   ├── config.ts           # Cấu hình API endpoint cho frontend (mặc định /api/status)
│   ├── main.tsx            # Entry point render React DOM
│   ├── styles.css          # Toàn bộ mã định kiểu CSS, layout responsive và hiệu ứng chuyển động
│   ├── types.ts            # Khai báo TypeScript types/interfaces dùng chung (BotSnapshot, PublicBotSnapshot, ...)
│   └── vite-env.d.ts       # Khai báo kiểu môi trường Vite client
├── .env.example            # Mẫu cấu hình môi trường máy chủ (.env)
├── .env.local.example      # Mẫu cấu hình môi trường ứng dụng và giao diện (.env.local)
├── bots.config.json        # Danh sách cấu hình bot, endpoint nội bộ, ngưỡng độ trễ và nhãn tính năng
├── index.html              # HTML template gốc của ứng dụng giao diện
├── index.js                # Compatibility launcher script (chuyển tiếp lệnh khởi chạy npm start)
├── LICENSE                 # Giấy phép mã nguồn mở MIT
├── package.json            # Khai báo dependencies, scripts và cấu hình dự án
├── package-lock.json       # Khóa cố định cây phiên bản dependencies
├── tsconfig.json           # Cấu hình TypeScript gốc
├── tsconfig.app.json       # Cấu hình TypeScript biên dịch phần frontend
└── vite.config.ts          # Cấu hình Vite bundler và proxy phát triển /api
```

---

## Yêu cầu môi trường (Prerequisites)

- **Node.js**: Phiên bản `>= 18.0.0` (yêu cầu hỗ trợ native ES Modules và global `fetch` API).
- **Trình quản lý gói**: `npm` đi kèm file khóa `package-lock.json` (không chuyển đổi sang yarn/pnpm để đảm bảo tính đồng nhất phụ thuộc).

---

## Tải xuống & Cài đặt (Installation)

Thực hiện các lệnh sau trong terminal:

```bash
# 1. Clone repository mã nguồn từ GitHub
git clone https://github.com/nksz1/status_discord.git

# 2. Di chuyển vào thư mục dự án
cd status_discord

# 3. Cài đặt toàn bộ dependencies đã khóa phiên bản
npm install
```

---

## Khởi chạy nhanh (Quick Start)

Quy trình 3 bước tối giản để đưa hệ thống vào hoạt động:

### Bước 1: Clone & Cài đặt gói
```bash
git clone https://github.com/nksz1/status_discord.git
cd status_discord
npm install
```

### Bước 2: Khởi tạo cấu hình tối thiểu
Tạo các file cấu hình từ file mẫu có sẵn:
```bash
cp .env.example .env
cp .env.local.example .env.local
```
- Khai báo danh sách bot và địa chỉ nội bộ trong `bots.config.json`.
- Điền các chuỗi Bearer token tương ứng (tối thiểu 32 ký tự) vào file `.env`.

### Bước 3: Khởi chạy hệ thống

**Chế độ phát triển (Development):**
```bash
npm run dev
```
*Chạy song song cả Vite dev server (`http://localhost:5173`) và Express aggregator backend (`http://localhost:25133`).*

**Chế độ sản xuất (Production):**
```bash
npm run build
npm start
```
*Biên dịch giao diện frontend sang thư mục `dist/` và khởi chạy máy chủ Express phục vụ toàn diện tại `http://localhost:25133`.*

---

## Cấu hình chi tiết (Configuration)

### 1. Danh sách dịch vụ (`bots.config.json`)

File `bots.config.json` nằm tại thư mục gốc, định nghĩa các tham số ngưỡng và danh sách các bot cần giám sát:

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
      "url": "http://127.0.0.1:25000/api/uptime/status",
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
      "url": "http://127.0.0.1:25001/api/uptime/status",
      "tokenEnv": "UPTIME_TOKEN_BOT_BETA",
      "features": [
        { "id": "economy", "label": "Hệ thống kinh tế" },
        { "id": "minigames", "label": "Trò chơi tương tác" }
      ]
    }
  ]
}
```

#### Giải thích chi tiết các tham số:
- **`defaults`**:
  - `latencySlowMs` *(number)*: Ngưỡng trễ phản hồi (ms) để bắt đầu tính thời gian chậm (mặc định: `800`). Có thể ghi đè riêng cho từng bot.
  - `slowGraceMs` *(number)*: Thời gian duy trì độ trễ cao liên tục trước khi công bố trạng thái `slow` (mặc định: `9000` ms = 9 giây).
  - `interruptionGraceMs` *(number)*: Thời gian mất tín hiệu liên tục trước khi chuyển từ `checking` sang `interrupted` (mặc định: `30000` ms = 30 giây).
  - `recoveringWindowMs` *(number)*: Thời gian duy trì trạng thái theo dõi phục hồi trước khi chuyển về `normal` (mặc định: `900000` ms = 15 phút).
- **`bots[]`**:
  - `id` *(string)*: Mã định danh dịch vụ duy nhất (chuẩn hóa dạng kebab-case, ví dụ `bot-service-alpha`).
  - `label` *(string)*: Tên hiển thị công khai trên giao diện người dùng.
  - `url` *(string)*: Đường dẫn HTTP endpoint uptime nội bộ của dịch vụ bot.
  - `tokenEnv` *(string)*: Tên biến môi trường trong file `.env` chứa Bearer token xác thực tương ứng.
  - `latencySlowMs` *(number, tùy chọn)*: Ghi đè ngưỡng trễ riêng cho bot này.
  - `features[]` *(array)*: Danh sách tính năng con (`id`, `label`) để hiển thị chi tiết cho người dùng cuối.

---

### 2. Biến môi trường bảo mật (`.env`)

File `.env` lưu trữ các khóa xác thực và cấu hình bảo vệ tầng mạng phía server. **Tuyệt đối không commit file này lên Git.**

```bash
# =====================================================================
# Server Environment Configuration (.env)
# =====================================================================

# Server-side Bearer tokens cho từng bot (yêu cầu tối thiểu 32 ký tự, khuyến nghị chuỗi hex 64 ký tự ngẫu nhiên)
# Tên biến môi trường phải khớp hoàn toàn với trường "tokenEnv" trong bots.config.json
UPTIME_TOKEN_BOT_ALPHA=your_secure_random_64_hex_token_for_alpha_here
UPTIME_TOKEN_BOT_BETA=your_secure_random_64_hex_token_for_beta_here

# Giới hạn tần suất gọi API công khai (In-memory IP Rate Limiting cho GET /api/status)
PUBLIC_STATUS_RATE_LIMIT_MAX=60
PUBLIC_STATUS_RATE_LIMIT_WINDOW_MS=60000

# Cấu hình CORS tùy chọn (để trống nếu không bật header CORS công khai)
PUBLIC_CORS_ORIGIN=

# Số hop Reverse Proxy tin cậy:
# - Đặt 0 (mặc định) nếu Express kết nối trực tiếp với Internet.
# - Đặt 1 nếu đứng sau 1 lớp reverse proxy (Cloudflare, Nginx, Caddy, Docker bridge).
TRUST_PROXY_HOPS=0
```

---

### 3. Biến môi trường ứng dụng (`.env.local`)

File `.env.local` cấu hình cổng dịch vụ của backend aggregator và các cờ tham số dành cho giao diện:

```bash
# =====================================================================
# Application & Client Runtime Configuration (.env.local)
# =====================================================================

# Cổng lắng nghe của Backend Express Aggregator
SERVER_PORT=25133

# Đường dẫn API công khai cho Client (giữ nguyên /api/status khi chạy chung Express)
VITE_API_URL=/api/status

# Chế độ debug cho Frontend (true để hiển thị raw public JSON payload dưới chân trang)
VITE_SHOW_DEBUG=false

# (Tùy chọn) Danh sách endpoint dự phòng nếu bots.config.json không tồn tại
# BOT_ENDPOINTS=Bot Alpha|http://127.0.0.1:25000/api/uptime/status
```

---

## Danh mục lệnh thực thi (Available Scripts)

Các lệnh chuẩn được định nghĩa sẵn trong `package.json`:

| Lệnh thực thi | Mục đích | Cơ chế hoạt động chi tiết |
|---|---|---|
| `npm run dev` | Phát triển toàn diện | Sử dụng `concurrently` để chạy đồng thời cả frontend Vite (`npm run dev:frontend`) và backend aggregator (`npm run dev:backend`). |
| `npm run dev:frontend` | Phát triển giao diện | Khởi chạy Vite dev server (lắng nghe `0.0.0.0`, tự động proxy các request `/api` sang cổng backend). |
| `npm run dev:backend` | Phát triển backend | Chạy file `server/index.ts` thông qua công cụ `tsx` để thăm dò bot và cập nhật `data.json`. |
| `npm run build` | Biên dịch Production | Chạy kiểm tra kiểu tĩnh TypeScript cho frontend (`tsc -b`) và biên dịch đóng gói bundle React vào thư mục `dist/`. |
| `npm start` | Vận hành Production | Khởi chạy máy chủ Express production: định kỳ poll bot, phục vụ API `/api/status` và serve static files từ `dist/`. |
| `node index.js` | Launcher tương thích | Script khởi chạy tương thích chuyển tiếp gọi tới `npm start`. |

---

## Cam kết & Tiêu chuẩn bảo mật (Security & Defense in Depth)

Hệ thống được thiết kế theo nguyên tắc phòng vệ đa tầng (**Defense in Depth**), tuân thủ 6 tiêu chuẩn an ninh cốt lõi:

1. **Zero-Knowledge Client (Không lộ hạ tầng tới Client)**:
   - Giao diện người dùng (React UI) hoạt động hoàn toàn ở chế độ Zero-Knowledge: trình duyệt chỉ gửi yêu cầu duy nhất tới `GET /api/status`.
   - Client hoàn toàn không biết địa chỉ IP, cổng nội bộ, URL máy chủ bot hay thông tin xác thực của các bot dịch vụ.
2. **Cô lập thông tin xác thực phía Server (Credential Isolation)**:
   - Toàn bộ Bearer Token phục vụ việc poll bot được cô lập hoàn toàn trong biến môi trường server (`.env`).
   - Tuyệt đối không đặt token vào các biến có tiền tố `VITE_*` (tránh rò rỉ vào bundle JavaScript của trình duyệt). Mã nguồn kiểm tra độ dài token bắt buộc phải đạt từ 32 ký tự trở lên.
3. **Bộ lọc Whitelist Sanitization nghiêm ngặt (`toPublicBotSnapshot`)**:
   - Dữ liệu trả về qua endpoint công khai bắt buộc phải qua hàm lọc allowlist `toPublicBotSnapshot`.
   - Triệt để loại bỏ các dữ liệu nhạy cảm: URL gốc, cổng, địa chỉ host, `guildCount`, bot ID, bot tag, log lỗi chi tiết (`errorMessage`, `lastError`), sự kiện kỹ thuật (`events`), và stack trace nội bộ.
4. **Phòng chống lạm dụng & từ chối dịch vụ (DoS Protection & Resource Bounds)**:
   - Giới hạn kích thước phản hồi tối đa từ upstream bot ở mức **64 KiB** (`MAX_RESPONSE_BYTES`) để chống cạn kiệt bộ nhớ.
   - Ngắt kết nối nghiêm ngặt sau **6 giây** timeout (`FETCH_TIMEOUT_MS = 6000`) qua `AbortController`.
   - Từ chối chuyển hướng HTTP (`redirect: "error"`) nhằm ngăn chặn tấn công SSRF hoặc vòng lặp chuyển hướng.
   - Tích hợp sẵn bộ giới hạn tần suất truy cập theo IP trong bộ nhớ (`enforcePublicStatusRateLimit`) kèm đầy đủ các HTTP header tiêu chuẩn: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`.
5. **Cấu hình Reverse Proxy an toàn (`TRUST_PROXY_HOPS`)**:
   - Khi triển khai sau các giải pháp Reverse Proxy (Cloudflare, Nginx, Docker bridge), cấu hình `TRUST_PROXY_HOPS=1` cho phép Express nhận diện chính xác địa chỉ IP client thực tế qua header `X-Forwarded-For`, ngăn ngừa tình trạng tất cả người dùng dùng chung IP của proxy và bị khóa `429 Too Many Requests` hàng loạt.
6. **Bảo vệ kênh truyền Upstream (HTTPS Recommendation)**:
   - Khi các bot upstream được lưu trữ trên các máy chủ khác nhau qua mạng diện rộng, luôn khuyến nghị sử dụng giao thức `https://` cho URL của bot trong `bots.config.json` để mã hóa toàn bộ dữ liệu và Bearer token trên đường truyền, loại bỏ rủi ro tấn công trung gian (Man-in-the-Middle).

---

## English Quick Start Guide

### Overview
**Neko Discord Uptime Dashboard** is a lightweight, public-facing status dashboard designed for Discord bot ecosystems. Built with Node.js ESM, TypeScript, Express 5, React 19, and Vite 6, it acts as an independent aggregator: polling authenticated internal HTTP status endpoints from your bot instances, evaluating service impact states, persisting history in a local JSON file (`data.json`), and serving a strictly sanitized public API (`GET /api/status`) to a modern React UI.

> **Note**: This repository does **NOT** contain Discord bot code, does not connect to the Discord Gateway, handles no slash commands, and requires no Discord bot tokens.

### Prerequisites
- Node.js `>= 18.0.0`
- `npm` (with `package-lock.json`)

### Quick Setup

```bash
# 1. Clone repository
git clone https://github.com/nksz1/status_discord.git
cd status_discord

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
cp .env.local.example .env.local
```

### Configuration
1. Edit `bots.config.json` to define your monitored bot services and internal URLs.
2. Edit `.env` to provide secure Bearer tokens (minimum 32 characters) matching `tokenEnv` in `bots.config.json`:
   ```bash
   UPTIME_TOKEN_BOT_ALPHA=your_secure_32_character_token_here
   PUBLIC_STATUS_RATE_LIMIT_MAX=60
   TRUST_PROXY_HOPS=0
   ```
3. Edit `.env.local` for port and frontend settings:
   ```bash
   SERVER_PORT=25133
   VITE_API_URL=/api/status
   VITE_SHOW_DEBUG=false
   ```

### Running

- **Development Mode** (Vite on `:5173` + Express on `:25133`):
  ```bash
  npm run dev
  ```

- **Production Mode** (Build frontend + start Express):
  ```bash
  npm run build
  npm start
  ```
  The production server will listen on `http://localhost:25133`.

### Key Security Invariants
- **Zero-Knowledge UI**: The frontend only queries `/api/status` and has zero knowledge of upstream bot URLs, tokens, or infrastructure.
- **Server-Side Isolation**: Tokens stay strictly on the server; never use `VITE_*` prefixes for secrets.
- **Strict Allowlist**: Technical fields (`host`, `port`, `guildCount`, internal IDs, error stack traces) are stripped before public delivery.
- **Upstream Guardrails**: Upstream bot requests enforce a 6-second timeout, a 64 KiB maximum payload cap, and reject HTTP redirects.

---

## Đóng góp & Giấy phép (Contributing & License)

### Đóng góp (Contributing)
Mọi đóng góp nhằm nâng cao tính ổn định và tính năng của hệ thống đều được hoan nghênh:
1. Mở một **Issue** để thảo luận về lỗi phát hiện hoặc đề xuất tính năng mới trước khi tiến hành thực hiện.
2. Fork repository, tạo nhánh phát triển (`git checkout -b feature/amazing-feature`).
3. Đảm bảo mã nguồn tuân thủ TypeScript typing và vượt qua bước kiểm tra biên dịch (`npm run build`).
4. Commit thay đổi và đính kèm thông tin chứng nhận:
   ```text
   Co-Authored-By: Codex <noreply@openai.com>
   ```
5. Mở **Pull Request** giải thích chi tiết các điểm thay đổi.

### Giấy phép (License)
Dự án được phân phối chính thức theo giấy phép mã nguồn mở **MIT License**. Chi tiết xem tại file [LICENSE](LICENSE).

Copyright (c) 2026 Neko Studio.
