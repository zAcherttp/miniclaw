# Chương 1: Tổng quan

## Lý do chọn đề tài
Các mô hình ngôn ngữ lớn (LLM) hiện nay sở hữu năng lực hiểu ý định và thực thi tác vụ phức tạp thông qua hệ thống công cụ bổ trợ. Tuy nhiên, hầu hết các hệ thống trợ lý ảo phổ biến như Google Calendar hay Microsoft To-Do vẫn yêu cầu người dùng thực hiện nhiều thao tác nhập liệu và quản lý thủ công. Đồng thời, việc truyền gửi thông tin liên tục lên các máy chủ đám mây làm gia tăng nguy cơ rò rỉ dữ liệu cá nhân của người dùng. Để giải quyết các hạn chế này, các kiến trúc tác nhân AI tối giản (minimal AI agents) vận hành cục bộ (local-first) như OpenClaw hay Nanobot đang trở thành xu hướng nghiên cứu chính nhờ khả năng bảo mật dữ liệu vượt trội.

Kế thừa thiết kế từ các hệ thống tác nhân tối giản này, đề tài tập trung xây dựng MiniClaw — một trợ lý ảo cá nhân chạy nền (daemon) ưu tiên cục bộ (local-first) nhằm tự động hóa quản lý lịch trình và công việc hằng ngày. Hệ thống tập trung phát triển theo hai định hướng kỹ thuật cốt lõi. Thứ nhất, hệ thống xây dựng cơ chế bộ nhớ dài hạn giúp duy trì và khai thác động cơ ngữ cảnh cá nhân bền vững qua các phiên làm việc kéo dài. Thứ hai, hệ thống mở rộng từ mô hình phản hồi theo yêu cầu đơn lẻ sang mô hình chủ động (proactive), hỗ trợ theo dõi, nhắc nhở và tự động điều phối lịch trình theo thời gian thực.

Đề tài **"Tích hợp LLM để phát triển trợ lý ảo giúp quản lý lịch trình và công việc hằng ngày"** tập trung hiện thực hóa các giải pháp kỹ thuật trên thông qua tác nhân thông minh MiniClaw.

## Mục tiêu đề tài

### Xây dựng trợ lý ảo cá nhân tự động hóa công việc
Mục tiêu chính là xây dựng một trợ lý cá nhân hoạt động dưới dạng dịch vụ chạy nền liên tục (daemon), tự động hóa các tác vụ quản lý lịch trình hằng ngày qua giao diện Telegram:
- Hệ thống tiếp nhận và xử lý yêu cầu qua tin nhắn Telegram tức thời.
- Thiết lập giao diện tương tác trực quan, đảm bảo thời gian phản hồi nhanh chóng.
- Tận dụng khả năng hiểu hội thoại tự nhiên của LLM để nâng cao trải nghiệm người dùng.
- Chủ động theo dõi tiến độ công việc và phát thông báo nhắc nhở khi đến hạn.

### Tích hợp tác nhân AI và thiết kế khung công cụ tác nhân (Tool Harness)
Đề tài nghiên cứu cách thức xây dựng vòng lặp tác nhân (agent loop) dựa trên ReAct kết hợp thiết kế khung công cụ (`Tool Harness`):
- Chuẩn hóa lược đồ mô tả công cụ bằng JSON Schema giúp LLM gọi hàm chính xác.
- Triển khai khung công cụ (`Tool Harness`) hỗ trợ thực thi câu lệnh shell và CLI của các hệ thống văn phòng (Google Workspace qua `gws`, Lark Suite qua `lark-cli`) thông qua công cụ thực thi lệnh hệ thống `execute`.
- Thiết lập tầng kiểm soát và phân quyền an toàn, ngăn chặn các hành vi leo thang đặc quyền hoặc truy cập trái phép.

### Nghiên cứu tối ưu ngữ cảnh và cơ chế nén ngữ cảnh tự động
Giải quyết giới hạn cửa sổ ngữ cảnh và chi phí token của LLM thông qua các kỹ thuật xử lý ngữ cảnh:
- Phân tầng hệ thống bộ nhớ thành hai lớp: bộ nhớ ngắn hạn duy trì dữ liệu tương tác tức thời và bộ nhớ dài hạn lưu trữ thông tin bền vững.
- Phát triển thuật toán nén ngữ cảnh (context compaction) tự động nhằm lọc bỏ thông tin nhiễu, chỉ lưu trữ các sự kiện và trạng thái quan trọng giúp tối ưu hóa ngân sách token và duy trì hiệu năng của tác nhân.

### Triển khai trích xuất quy trình làm việc có kiểm soát (Reusable Workflow Extraction - HITL)
Giúp tác nhân tự mở rộng năng lực hành vi qua quá trình sử dụng:
- Nhận diện các mẫu hành vi lặp lại từ lịch sử tương tác của người dùng.
- Đề xuất đóng gói chuỗi hành động thành quy trình làm việc mới dưới dạng tệp `SKILL.md`.
- Áp dụng cơ chế kiểm soát bởi người dùng (HITL) để xác nhận trước khi nạp động quy trình vào hệ thống.

### Rèn luyện tư duy hệ thống và kỹ năng giải quyết vấn đề thực tiễn
Thông qua quá trình xây dựng sản phẩm thực tế, đồ án giúp nâng cao các kỹ năng chuyên môn:
- Sử dụng Node.js, TypeScript và thư viện LangGraph để thiết kế kiến trúc đồ thị trạng thái bền vững.
- Rèn luyện tư duy thiết kế phần mềm định hướng an toàn, bảo vệ dữ liệu cá nhân và quản lý phiên làm việc hiệu quả.

## Đối tượng và phạm vi nghiên cứu

### Đối tượng nghiên cứu
- Kiến trúc tác nhân thông minh (Agent) và vòng lặp tác nhân (agent loop) ReAct.
- Cơ chế tối ưu ngữ cảnh và các phương pháp nén thông tin hội thoại.
- Khung công cụ (`Tool Harness`) và cơ chế gọi hàm (tool call).
- Quy trình trích xuất quy trình làm việc có kiểm soát (Reusable Workflow Extraction - HITL).
- Bộ lập lịch sự kiện chạy ngầm và cơ chế gộp tin nhắn (message coalescing).

### Phạm vi nghiên cứu
Đề tài tập trung vào các nội dung thực tiễn sau:
- Sử dụng môi trường Node.js và TypeScript để phát triển hệ thống.
- Sử dụng LangGraph làm động cơ điều phối trạng thái, Grammy xây dựng kênh Telegram Bot và nền tảng LangSmith để giám sát, gỡ lỗi.
- Triển khai tác nhân ưu tiên cục bộ (local-first), hỗ trợ gọi LLM cục bộ (Ollama) và kết nối với các mô hình ngôn ngữ lớn qua API đám mây thương mại.
- Lưu trữ an toàn dữ liệu người dùng cục bộ qua các tệp định dạng JSON gồm `reminders.json`, `memory.json` và `profile.json`.

Đề tài không thực hiện:
- Tái huấn luyện hoặc tinh chỉnh (fine-tuning) các mô hình ngôn ngữ lớn từ đầu.
- Xây dựng giao diện Web Dashboard tự phát triển phức tạp hoặc ứng dụng di động native.
- Tích hợp các cổng thanh toán hoặc nền tảng đám mây khác ngoài Telegram và LangSmith.

## Phương pháp nghiên cứu

### Nhóm phương pháp nghiên cứu lý thuyết và tài liệu
- Tìm hiểu các mô hình bộ nhớ tác nhân, trọng tâm là cơ chế quản lý bộ nhớ hợp nhất AgeMem [yu2026agentic] và hệ thống lưu trữ bảo toàn sự thật MemMachine [memverge2026memmachine].
- Nghiên cứu tiến trình phát triển cơ chế gọi công cụ của LLM Agent, từ gọi công cụ đơn lẻ đến điều phối đa công cụ phức tạp [xu2026evolution].
- Phân tích lý thuyết về thiết kế khung công cụ cho tác nhân qua mô hình thiết kế khung công cụ tác nhân (Agentic Harness Engineering - AHE) [ahe2026agentic] và kiến trúc khung công cụ mở rộng (Extensible Harness) [lastharness2026last].
- Nghiên cứu ứng dụng mô hình điều khiển tự thích ứng MAPE-K (Monitor-Analyze-Plan-Execute-Knowledge) trong việc giám sát và tối ưu hóa vòng lặp tác nhân [emergentmindmape].
- Khảo sát các mã nguồn mở thiết kế tác nhân tối giản chạy cục bộ như Nanobot [hkudsnanobot] và OpenClaw [openclawproject] để làm cơ sở định hình kiến trúc hệ thống.

### Nhóm phương pháp nghiên cứu thực nghiệm
- Xây dựng nguyên mẫu hệ thống MiniClaw chạy thử nghiệm thực tế.
- Đo lường và đánh giá các chỉ số: độ chính xác khi gọi công cụ, lượng token tiết kiệm sau khi nén ngữ cảnh, và thời gian phản hồi của hệ thống.
- Thu thập phản hồi từ người dùng thực nghiệm để điều chỉnh và tối ưu hóa quy trình tương tác.

## Cấu trúc đồ án
Báo cáo đồ án được cấu trúc thành 6 chương chính thể hiện toàn bộ nội dung nghiên cứu và triển khai thực nghiệm hệ thống trợ lý ảo:
- **Chương I: Tổng quan**: Trình bày lý do chọn đề tài, mục tiêu, đối tượng, phạm vi và phương pháp nghiên cứu.
- **Chương II: Cơ sở lý thuyết**: Giới thiệu các khái niệm về LLM, ReAct Agent, quản lý bộ nhớ tác nhân, tối ưu ngữ cảnh, khung công cụ và các công nghệ sử dụng.
- **Chương III: Tổng quan về hệ thống**: Trình bày ý tưởng thiết kế, các nguyên tắc cốt lõi như gộp tin nhắn (message coalescing), bảo mật ranh giới và vòng lặp hoạt động chính.
- **Chương IV: Phân tích và thiết kế hệ thống**: Chi tiết sơ đồ Use Case, sơ đồ hoạt động, sơ đồ trình tự, thiết kế ERD, Class Diagram, kiến trúc phân lớp và kịch bản tương tác người dùng.
- **Chương V: Cài đặt và kiểm thử**: Mô tả môi trường phát triển, cài đặt các thành phần chính và phân tích kết quả kiểm thử qua 5 nhóm kịch bản.
- **Chương VI: Kết luận**: Tổng kết kết quả đạt được, các hạn chế còn tồn tại và định hướng phát triển trong tương lai.

Nhìn chung, Chương I đã trình bày các vấn đề tổng quan về tính cấp thiết, mục tiêu phát triển và phạm vi tiếp cận của đề tài MiniClaw. Các nền tảng lý thuyết và công nghệ cốt lõi phục vụ cho việc giải quyết các bài toán này sẽ được đi sâu phân tích trong chương tiếp theo.
