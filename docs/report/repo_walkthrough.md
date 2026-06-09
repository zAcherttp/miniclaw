# Miniclaw 🐾

**Đồ án 1:** *Tích hợp LLM để phát triển trợ lý ảo giúp quản lý lịch trình và công việc hằng ngày* (Integrating LLMs to Develop a Virtual Assistant for Daily Schedule and Task Management)

---

## Giới thiệu & Tổng quan (Introduction & Overview)

**Miniclaw** là một tác nhân thông minh cá nhân (personal AI assistant daemon) hoạt động chạy ngầm liên tục, giao tiếp qua kênh **Telegram Bot** và giao diện dòng lệnh (**CLI**). Hệ thống được xây dựng trên nền tảng **Node.js, TypeScript** và khung điều phối đồ thị trạng thái **LangGraph** nhằm tự động hóa các hoạt động quản lý lịch trình, công việc và tương tác hệ thống một cách tối ưu, bảo mật và an toàn dữ liệu.

Đây là sản phẩm thực nghiệm cốt lõi của Đồ án 1: **"Tích hợp LLM để phát triển trợ lý ảo giúp quản lý lịch trình và công việc hằng ngày"**.

---

## Mục tiêu nghiên cứu & Phát triển (Objectives)

Hệ thống được thiết kế và hiện thực hóa nhằm đạt được các mục tiêu khoa học và thực tiễn sau:

1. **Trợ lý ảo cá nhân tự động hóa (Automated Personal Assistant Daemon):**
   - Vận hành như một dịch vụ chạy ngầm (daemon) liên tục theo dõi thời gian biểu.
   - Nhận yêu cầu và tương tác trực tiếp qua giao diện Telegram Chat trực quan.
   - Chủ động phân tích lịch trình để đưa ra các nhắc nhở, cảnh báo sớm trước thời hạn công việc.

2. **Thiết kế bộ khung điều phối công cụ (Secure Tool Harness):**
   - Triển khai vòng lặp tác nhân dựa trên mô hình **ReAct (Reasoning and Acting)**.
   - Tự động gọi các API/câu lệnh thông qua mô tả JSON Schema chuẩn hóa.
   - Hỗ trợ gọi các công cụ tương tác cục bộ và các công cụ văn phòng như Google Workspace (Drive, Calendar, Gmail, Chat qua `gws`) và Lark Suite (`lark-cli`).
   - Thiết lập ranh giới bảo mật hộp cát (sandbox) và phân quyền chặt chẽ (`resolveSecurePath`) để ngăn chặn việc thực thi các lệnh hệ thống trái phép.

3. **Kỹ nghệ ngữ cảnh & Tự động nén ngữ cảnh (Context Engineering & Auto-Compaction):**
   - Thiết lập cơ chế phân tầng bộ nhớ: **Bộ nhớ ngắn hạn** (lịch sử hội thoại tức thời) và **Bộ nhớ dài hạn** (Vector Database với tìm kiếm tương đồng Cosine).
   - Triển khai thuật toán nén ngữ cảnh tự động ngầm khi lịch sử vượt quá ngưỡng kích hoạt (50.000 token), giúp tối ưu hóa ngân sách token và giảm độ trễ (latency).

4. **Trích xuất quy trình làm việc có kiểm soát (Reusable Workflow Extraction - HITL):**
   - Tự động nhận diện các hành vi lặp lại từ lịch sử hội thoại của người dùng.
   - Đóng gói chuỗi hành động thành các quy trình/kỹ năng mới dưới dạng tệp tin `SKILL.md`.
   - Sử dụng cơ chế tương tác con người kiểm soát vòng lặp (**Human-in-the-loop**) để yêu cầu phê duyệt/hiệu chỉnh trước khi nạp động kỹ năng vào hệ thống mà không cần khởi động lại.
