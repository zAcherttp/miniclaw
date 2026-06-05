# Chương 1: Tổng quan

## Lý do chọn đề tài
Trong bối cảnh chuyển đổi số diễn ra mạnh mẽ cùng sự phát triển nhanh chóng của trí tuệ nhân tạo, nhu cầu quản lý thời gian, công việc và lịch trình cá nhân ngày càng trở nên quan trọng. Mặc dù hiện nay đã có nhiều ứng dụng hỗ trợ phổ biến như Google Calendar hay Microsoft To-Do, phần lớn vẫn yêu cầu người dùng thực hiện nhiều thao tác nhập liệu và quản lý thủ công, gây bất tiện đối với những người có lịch trình bận rộn.

Sự phát triển của các mô hình ngôn ngữ lớn (Large Language Models – LLM) đã tạo tiền đề cho thế hệ trợ lý thông minh mới, không chỉ dừng lại ở khả năng hội thoại mà còn có thể hiểu ý định của người dùng và chủ động thực hiện các tác vụ thông qua nhiều công cụ khác nhau. Song song với đó, các kiến trúc tác nhân AI tối giản (minimal AI agents) hoạt động cục bộ như OpenClaw hay Nanobot đang thu hút sự quan tâm nhờ khả năng vận hành độc lập, linh hoạt và đảm bảo quyền riêng tư dữ liệu.

Kế thừa định hướng thiết kế từ các hệ thống này, đề tài tập trung xây dựng một trợ lý cá nhân gọn nhẹ, hoạt động hiệu quả trên môi trường cục bộ nhằm hỗ trợ quản lý lịch trình và công việc hằng ngày. Bên cạnh việc tận dụng các ưu điểm của kiến trúc tác nhân tối giản, hệ thống được phát triển theo hai hướng chính. Thứ nhất, nâng cao khả năng quản lý ngữ cảnh thông qua cơ chế bộ nhớ dài hạn, giúp duy trì và khai thác thông tin tích lũy trong quá trình tương tác kéo dài. Thứ hai, mở rộng từ mô hình phản hồi theo yêu cầu (reactive) sang mô hình chủ động (proactive), cho phép hệ thống theo dõi, nhắc nhở và hỗ trợ điều phối lịch trình theo thời gian thực.

Xuất phát từ những yêu cầu và tiềm năng trên, em lựa chọn thực hiện đề tài **"Tích hợp LLM để phát triển trợ lý ảo giúp quản lý lịch trình và công việc hằng ngày"** nhằm xây dựng tác nhân thông minh Miniclaw.

## Mục tiêu đề tài

### Xây dựng trợ lý ảo cá nhân tự động hóa công việc
Mục tiêu chính là xây dựng một trợ lý cá nhân chạy nền liên tục (daemon) có khả năng tự động hóa các tác vụ quản lý lịch trình hàng ngày với các yêu cầu:
- Hệ thống tiếp nhận và xử lý yêu cầu qua tin nhắn Telegram tức thời.
- Giao diện trò chuyện trực quan, dễ dàng tương tác và phản hồi nhanh chóng.
- Mang lại trải nghiệm tốt cho người dùng thông qua khả năng hiểu hội thoại tự nhiên.
- Chủ động theo dõi lịch trình và phát thông báo nhắc nhở khi đến hạn.

### Tích hợp tác nhân AI và thiết kế bộ công cụ tác nhân (Tool Harness)
Đề tài nghiên cứu cách thức xây dựng vòng lặp tác nhân dựa trên ReAct (Reasoning and Acting) kết hợp thiết kế bộ công cụ (Tool Harness):
- Thiết kế hệ thống mô tả lược đồ công cụ bằng JSON Schema chuẩn xác để LLM dễ dàng gọi hàm.
- Triển khai bộ khung công cụ ngoại vi (Tool Harness) hỗ trợ thực thi các câu lệnh shell và CLI của các hệ thống văn phòng (như Google Workspace, Lark Suite) thông qua công cụ thực thi lệnh hệ thống (execute tool).
- Xây dựng tầng trung gian kiểm soát và phân quyền để đảm bảo các lời gọi công cụ diễn ra chính xác và an toàn.

### Nghiên cứu Context Engineering và cơ chế nén ngữ cảnh tự động
Giải quyết bài toán giới hạn cửa sổ ngữ cảnh và chi phí token của LLM:
- Triển khai cơ chế phân tầng bộ nhớ ngắn hạn và dài hạn.
- Xây dựng thuật toán nén ngữ cảnh hội thoại tự động (Context Compaction) để lọc thông tin nhiễu, chỉ giữ lại các sự kiện và trạng thái quan trọng giúp tiết kiệm token và duy trì hiệu năng của Agent.

### Triển khai trích xuất và lưu trữ quy trình làm việc tái sử dụng được (Reusable Workflow Extraction)
Giúp tác nhân có khả năng tự mở rộng hành vi thông qua quá trình sử dụng:
- Tự động nhận diện các mẫu hành vi lặp đi lặp lại của người dùng.
- Đề xuất trích xuất các bước hành động thành một quy trình làm việc mới dưới dạng tài liệu `SKILL.md`.
- Tương tác với người dùng (Human-in-the-loop) để nhận phê duyệt trước khi nạp động kỹ năng vào hệ thống.

### Rèn luyện tư duy hệ thống và kỹ năng giải quyết vấn đề thực tiễn
Thông qua quá trình xây dựng sản phẩm thực tế, đồ án giúp nâng cao các kỹ năng chuyên môn:
- Vận dụng Node.js, TypeScript và thư viện LangGraph để thiết kế kiến trúc tác nhân bền vững.
- Nâng cao tư duy thiết kế phần mềm, bảo mật dữ liệu cá nhân, và quản lý phiên làm việc của người dùng.

## Đối tượng và phạm vi nghiên cứu

### Đối tượng nghiên cứu
- Kiến trúc tác nhân thông minh (Agent) và vòng lặp ReAct.
- Kỹ nghệ ngữ cảnh (Context Engineering) và các phương pháp nén thông tin hội thoại.
- Kỹ nghệ bộ công cụ tác nhân (Tool Harness) và cơ chế gọi hàm (tool call).
- Quy trình trích xuất và lưu trữ quy trình làm việc tái sử dụng được (Reusable Workflow Extraction - HITL).
- Bộ lập lịch sự kiện chạy ngầm và xử lý bất đồng bộ (Message Coalescing).

### Phạm vi nghiên cứu
Đề tài tập trung vào các nội dung thực tiễn sau:
- Sử dụng Node.js và TypeScript làm nền tảng lập trình chính của hệ thống.
- Sử dụng LangGraph làm động cơ điều phối trạng thái và Grammy để xây dựng Telegram Bot.
- Triển khai chạy cục bộ (self-hosted) và kết nối với các mô hình ngôn ngữ lớn qua API thương mại hoặc Ollama (cho các mô hình mã nguồn mở chạy local).
- Quản lý dữ liệu người dùng cục bộ dạng JSON an toàn (`reminders.json`, `memory.json`, `profile.json`).

Đề tài không đi sâu vào:
- Huấn luyện hoặc tinh chỉnh (fine-tuning) các mô hình ngôn ngữ lớn từ đầu.
- Xây diện giao diện đồ họa web phức tạp hoặc phát triển ứng dụng di động native.
- Tích hợp hệ thống thanh toán hoặc các dịch vụ đám mây bên thứ ba ngoài Telegram.

## Phương pháp nghiên cứu

### Nhóm phương pháp nghiên cứu lý thuyết và tài liệu
- Tìm hiểu các nghiên cứu về bộ nhớ tác nhân, đặc biệt là cơ chế quản lý bộ nhớ hợp nhất AgeMem [yu2026agentic] và hệ thống lưu trữ bảo toàn sự thật MemMachine [memverge2026memmachine].
- Nghiên cứu quá trình tiến hóa sử dụng công cụ của LLM Agent từ gọi công cụ đơn lẻ đến điều phối đa công cụ phức tạp [xu2026evolution].
- Tìm hiểu lý thuyết về kỹ nghệ bộ khung công cụ tác nhân thông qua các mô hình kỹ nghệ bộ khung tác nhân (Agentic Harness Engineering - AHE) [ahe2026agentic] và cấu trúc bộ khung công cụ mở rộng (Extensible Harness) [lastharness2026last].
- Nghiên cứu mô hình điều khiển tự thích ứng MAPE-K (Monitor-Analyze-Plan-Execute-Knowledge) trong việc quản lý và tối ưu hóa vòng lặp tác nhân thông minh [emergentmindmape].
- Khảo sát các mã nguồn mở thiết kế tác nhân tối giản chạy cục bộ bao gồm Nanobot [hkudsnanobot] và OpenClaw [openclawproject] để làm cơ sở xây dựng hệ thống.

### Nhóm phương pháp nghiên cứu thực nghiệm
- Xây dựng nguyên mẫu hệ thống Miniclaw chạy thử nghiệm thực tế.
- Đo lường và đánh giá các chỉ số: độ chính xác khi gọi công cụ, lượng token tiết kiệm sau khi nén ngữ cảnh, và thời gian phản hồi của hệ thống.
- Thu thập phản hồi từ người dùng thực nghiệm để điều chỉnh và tối ưu hóa quy trình tương tác.

## Cấu trúc đồ án
Báo cáo đồ án được cấu trúc thành 6 chương chính thể hiện toàn bộ nội dung nghiên cứu và triển khai thực nghiệm hệ thống trợ lý ảo:
- **Chương I: Tổng quan**: Trình bày lý do chọn đề tài, mục tiêu, đối tượng, phạm vi và phương pháp nghiên cứu.
- **Chương II: Cơ sở lý thuyết**: Giới thiệu các khái niệm về LLM, ReAct Agent, quản lý bộ nhớ tác nhân, Context Engineering, Tool Harness và các công nghệ sử dụng.
- **Chương III: Tổng quan về hệ thống**: Trình bày ý tưởng thiết kế, các nguyên tắc cốt lõi như Message Coalescing, bảo mật ranh giới và vòng lặp hoạt động chính.
- **Chương IV: Phân tích và thiết kế hệ thống**: Chi tiết sơ đồ Use Case, sơ đồ hoạt động, sơ đồ trình tự, thiết kế ERD, Class Diagram, kiến trúc phân lớp và kịch bản tương tác người dùng.
- **Chương V: Cài đặt và kiểm thử**: Mô tả môi trường phát triển, cài đặt các thành phần chính và phân tích kết quả kiểm thử qua 5 nhóm kịch bản.
- **Chương VI: Kết luận**: Tổng kết kết quả đạt được, các hạn chế còn tồn tại và định hướng phát triển trong tương lai.
