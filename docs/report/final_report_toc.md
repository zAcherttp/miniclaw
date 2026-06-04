LỜI CẢM ƠN

Lời đầu tiên, tôi xin trân trọng cảm ơn Ban Giám hiệu Trường Đại học Công nghệ Thông tin - ĐHQG TP.HCM, Khoa Công nghệ Phần mềm đã tạo điều kiện thuận lợi về cơ sở vật chất, môi trường học tập và nghiên cứu trong suốt thời gian tôi theo học cũng như thực hiện đồ án tốt nghiệp.

Tôi xin bày tỏ lòng biết ơn sâu sắc đến Giảng viên hướng dẫn – người đã trực tiếp định hướng, chỉ bảo tận tình và đồng hành cùng tôi trong suốt quá trình nghiên cứu, phân tích, thiết kế và phát triển hệ thống "Miniclaw — Trợ lý ảo cá nhân tích hợp tác nhân AI thông minh". Những buổi thảo luận chuyên môn, những lời nhận xét, góp ý chi tiết của Thầy/Cô đã giúp tôi giải quyết nhiều bài toán kỹ thuật phức tạp về xử lý ngữ cảnh và thiết kế tác nhân AI để hoàn thiện đồ án này một cách tốt nhất.

Tôi cũng xin chân thành cảm ơn các thầy cô trong Khoa Công nghệ Phần mềm đã tận tâm giảng dạy, truyền đạt những kiến thức nền tảng vững chắc trong suốt bốn năm đại học, đặc biệt là các môn học: Nhập môn Trí tuệ nhân tạo, Công nghệ phần mềm, Cơ sở dữ liệu, Lập trình nâng cao và Kiến trúc phần mềm. Những kiến thức này chính là nền móng vững chắc giúp tôi tiếp cận công nghệ mới và tự mình xây dựng một hệ thống hoàn chỉnh.

Tôi xin gửi lời cảm ơn đến các thầy cô trong Hội đồng phản biện và chấm đồ án đã dành thời gian đọc, đánh giá và đóng góp những ý kiến phản biện quý báu giúp tôi hoàn thiện báo cáo cũng như nâng cao chất lượng sản phẩm.

Trong quá trình thực hiện đồ án, tôi đã nhận được sự hỗ trợ nhiệt tình từ bạn bè và các anh chị khóa trên. Những buổi trao đổi học thuật, chia sẻ tài liệu và cùng nhau debug lỗi hệ thống đã giúp tôi vượt qua nhiều trở ngại kỹ thuật lớn. Tôi đặc biệt cảm ơn nhóm bạn học đã luôn đồng hành, động viên tinh thần trong suốt giai đoạn chạy nước rút thực hiện đồ án.

Đặc biệt nhất, tôi xin dành lời cảm ơn sâu sắc đến gia đình và người thân – những người đã luôn hy sinh, chăm lo và tạo mọi điều kiện tốt nhất về cả vật chất lẫn tinh thần để tôi yên tâm học tập, nghiên cứu và hoàn thành chặng đường đại học.

Cuối cùng, tôi xin gửi lời cảm ơn đến cộng đồng mã nguồn mở và tác giả của các công nghệ, thư viện mạnh mẽ được sử dụng để xây dựng nên hệ thống Miniclaw: Node.js, TypeScript, LangGraph, Grammy Bot Framework, Ollama, Vitest và Biome. Sự phát triển mạnh mẽ của hệ sinh thái này là nguồn động lực và cảm hứng to lớn đối với tôi trong suốt thời gian phát triển dự án.

Mặc dù đã cố gắng nỗ lực hết mình để hoàn thành đề tài, song do kinh nghiệm thực tế và thời gian nghiên cứu còn hạn chế, đồ án chắc chắn không tránh khỏi những thiếu sót. Tôi rất mong nhận được sự cảm thông và những lời khuyên, góp ý quý báu từ quý thầy cô giáo cùng toàn thể các bạn sinh viên.

Xin chân thành cảm ơn!

TP. Hồ Chí Minh, tháng 05 năm 2026
Sinh viên thực hiện

--------------------------------------------------------------------------------

NHẬN XÉT CỦA GIÁO VIÊN HƯỚNG DẪN

--------------------------------------------------------------------------------

MỤC LỤC
DANH MỤC HÌNH ẢNH VÀ SƠ ĐỒ
DANH MỤC BẢNG BIỂU
DANH MỤC TỪ VIẾT TẮT

--------------------------------------------------------------------------------

CHƯƠNG I: TỔNG QUAN
  1.1 Lý do chọn đề tài
  1.2 Mục tiêu đề tài
    1.2.1 Xây dựng trợ lý ảo cá nhân tự động hóa công việc
    1.2.2 Tích hợp tác nhân AI dựa trên mô hình ngôn ngữ lớn (LLM)
    1.2.3 Nghiên cứu kỹ nghệ ngữ cảnh và nén lịch sử tự động (Context Compaction)
    1.2.4 Triển khai quy trình đàm thoại duyệt lưu kỹ năng (Workflow Consolidation)
    1.2.5 Rèn luyện tư duy hệ thống và kỹ năng giải quyết vấn đề thực tiễn
  1.3 Đối tượng và phạm vi nghiên cứu
    1.3.1 Đối tượng nghiên cứu (Tác nhân thông minh, Context Engineering, Task Scheduling)
    1.3.2 Phạm vi nghiên cứu (Môi trường cục bộ, giao diện Telegram, LLM APIs/Ollama)
  1.4 Phương pháp nghiên cứu
    1.4.1 Nhóm phương pháp nghiên cứu lý thuyết và tài liệu
    1.4.2 Nhóm phương pháp nghiên cứu thực nghiệm
  1.5 Cấu trúc đồ án (Bố cục các chương trong báo cáo)
    [figure: Sơ đồ cấu trúc nội dung đồ án (Sơ đồ khối thể hiện sự liên kết logic từ Chương I đến Chương VII)]

CHƯƠNG II: CƠ SỞ LÝ THUYẾT
  2.1 Tổng quan về mô hình ngôn ngữ lớn (LLM) và Prompt Engineering
  2.2 Kiến trúc Agent và vòng lặp tác nhân (Agent Loop - ReAct)
    [figure: Vòng lặp Agent ReAct (Sơ đồ thể hiện chu trình LLM quan sát môi trường, suy luận Reasoning, đưa ra quyết định gọi Tool và nhận phản hồi từ môi trường)]
  2.3 Quản lý bộ nhớ tác nhân (Agent Memory)
    2.3.1 Bộ nhớ ngắn hạn (Short-term chat history)
    2.3.2 Bộ nhớ dài hạn (Long-term vector Memory)
    [figure: Mô hình phân tầng bộ nhớ tác nhân (Sơ đồ so sánh đặc tính và không gian lưu trữ của Short-term Memory trong chat context và Long-term Memory trong vector database)]
  2.4 Kỹ nghệ ngữ cảnh (Context Engineering) và cơ chế tự động nén (Context Compaction)
    [figure: Quy trình nén và dọn dẹp ngữ cảnh (Sơ đồ mô tả lịch sử tin nhắn dài bị nén thành summary cô đọng thông qua LLM call trước khi đẩy lại vào context)]
  2.5 Quy trình duyệt lưu kỹ năng tự động dựa trên tương tác con người (Human-in-the-loop - HITL)
    [figure: Vòng lặp phản hồi Human-in-the-loop (Sơ đồ tương tác giữa LLM đề xuất quy trình và Con người duyệt/sửa đổi trước khi lưu trữ)]
  2.6 Các công nghệ và thư viện phát triển chính
    2.6.1 Node.js và TypeScript
    2.6.2 Grammy Bot Framework (Telegram API integration)
    2.6.3 LangGraph Engine (State machine control)
    2.6.4 Ollama và Universal LLM APIs

CHƯƠNG III: TỔNG QUAN VỀ HỆ THỐNG
  3.1 Ý tưởng thiết kế hệ thống
    [figure: Tổng quan mô hình tương tác Miniclaw (Sơ đồ thể hiện luồng tương tác giữa User, Bot Telegram, Onboarding CLI, và các tệp cấu hình cục bộ)]
  3.2 Các trụ cột thiết kế cốt lõi (Design Pillars)
    3.2.1 Tính không đồng bộ trong hàng đợi giao tiếp (Asynchrony)
      [figure: Sơ đồ luồng Message Coalescing (Sơ đồ thời gian thể hiện cách MessageBus gom cụm các tin nhắn gửi liên tục trong 250ms thành một batch trước khi xử lý)]
    3.2.2 Tính bảo mật và ranh giới an toàn (Security Boundary)
    3.2.3 Tính linh hoạt và khả năng nạp kỹ năng động (Dynamic Skill Loading)
  3.3 Vòng lặp hoạt động chính của hệ thống
    3.3.1 Vòng lặp trò chuyện & Thực thi lệnh thông thường
    3.3.2 Vòng lặp lập lịch nhắc nhở nền (Scheduler Daemon)
    3.3.3 Vòng lặp đàm thoại nén & Học kỹ năng tự động (Consolidation Loop)

CHƯƠNG IV: PHÂN TÍCH VÀ THIẾT KẾ HỆ THỐNG
  4.1 Sơ đồ Use Case
    4.1.1 Giới thiệu sơ đồ Use Case
    4.1.2 Các tác nhân trong hệ thống (User - Telegram User, Admin - CLI/Developer)
    4.1.3 Các Use Case chính
      [figure: Sơ đồ Use Case tổng thể hệ thống (Sơ đồ UML thể hiện các nhóm chức năng chính của người dùng và quản trị viên)]
    4.1.4 Đặc tả ca sử dụng chi tiết (Use Case Specification)
      4.1.4.1 Xác thực truy cập kênh (Telegram Allow-list check)
      4.1.4.2 Quản lý nhắc nhở (Tạo, cập nhật, xóa nhắc nhở)
      4.1.4.3 Thực thi và cập nhật kỹ năng (Skill execution)
      4.1.4.4 Tự động đề xuất & duyệt lưu quy trình (Workflow Consolidation)
  4.2 Sơ đồ hoạt động (Activity Diagram)
    4.2.1 Luồng xử lý tin nhắn & Vòng lặp Agent chính (Main Agent Loop)
      [figure: Sơ đồ hoạt động Vòng lặp Agent chính (Sơ đồ Activity UML mô tả chi tiết các bước từ khi nhận tin nhắn, phân tích, gọi tool, cho đến khi gửi phản hồi)]
    4.2.2 Luồng đàm thoại nén & duyệt quy trình (Workflow Consolidation - HITL)
      [figure: Sơ đồ hoạt động đàm thoại nén & duyệt quy trình (Sơ đồ Activity UML thể hiện quy trình đề xuất kỹ năng, đàm thoại chỉnh sửa và lưu trữ tệp SKILL.md)]
    4.2.3 Luồng nhắc nhở chạy ngầm (Scheduler Daemon)
      [figure: Sơ đồ hoạt động của TaskScheduler (Sơ đồ Activity UML mô tả quá trình quét reminders.json, thiết lập hẹn giờ và gửi nhắc nhở khi đến hạn)]
  4.3 Sơ đồ trình tự (Sequence Diagram)
    4.3.1 Trình tự quy trình Xử lý yêu cầu Chat & Lưu bộ nhớ dài hạn
      [figure: Sơ đồ trình tự xử lý Chat và Bộ nhớ dài hạn (Sơ đồ Sequence UML thể hiện tương tác thời gian giữa User, Channel, MessageBus, AgentLoop, LangGraph và MemoryManager)]
    4.3.2 Trình tự quy trình đàm thoại nén và duyệt quy trình (Workflow Consolidation)
      [figure: Sơ đồ trình tự đàm thoại nén và duyệt quy trình (Sơ đồ Sequence UML thể hiện các bước tương tác đồng bộ dữ liệu giữa các class khi lưu kỹ năng)]
  4.4 Thiết kế sơ đồ thực thể - quan hệ (ERD) và Class Diagram
    4.4.1 Sơ đồ thực thể - quan hệ logic (Logical ERD)
      4.4.1.1 Thực thể UserProfile (profile.json)
      4.4.1.2 Thực thể Reminder (reminders.json)
      4.4.1.3 Thực thể FactMemory (memory.json)
      4.4.1.4 Thực thể AppState (state.json)
      [figure: Sơ đồ Thực thể - Quan hệ logic (Sơ đồ ERD thể hiện mối quan hệ logic 1-1, 1-n giữa UserProfile, AppState, Reminder, và FactMemory)]
    4.4.2 Sơ đồ lớp chi tiết (Class Diagram - AgentLoop, MessageBus, TelegramChannel, TaskScheduler, StateManager, MemoryManager, FileCheckpointSaver)
      [figure: Sơ đồ lớp chi tiết của hệ thống (Sơ đồ Class UML thể hiện các thuộc tính, phương thức và mối quan hệ giữa AgentLoop, MessageBus, TaskScheduler, MemoryManager...)]
  4.5 Kiến trúc tổng quan hệ thống
    4.5.1 Sơ đồ kiến trúc phân lớp tổng thể (Layered Architecture)
      [figure: Sơ đồ kiến trúc phân lớp hệ thống (Sơ đồ kiến trúc mô tả 6 tầng từ Presentation, Integration đến Execution Engine và Offline Storage)]
    4.5.2 Sơ đồ hoạt động chi tiết nhiều người dùng (State isolation & Concurrency)
      [figure: Mô hình quản lý concurrency và isolation (Sơ đồ mô tả cách phân vùng dữ liệu và lưu checkpoint độc lập theo chatId của nhiều người dùng)]

CHƯƠNG V: SƠ ĐỒ MÀN HÌNH VÀ TƯƠNG TÁC (UI/UX DESIGN)
  5.1 Yêu cầu thiết kế giao diện (Telegram Bot và Command Line Interface)
  5.2 Sơ đồ luồng màn hình / Luồng tương tác (Screen Flow / Interaction Flow)
    [figure: Sơ đồ luồng màn hình và tương tác người dùng (Sơ đồ khối thể hiện sự chuyển đổi giữa các trạng thái giao diện CLI và Telegram Bot)]
  5.3 Chi tiết các kịch bản tương tác người dùng
    5.3.1 Giao diện khởi động và Onboarding CLI (`init` command)
      [figure: Ảnh chụp giao diện chạy lệnh pnpm dev init (Ảnh chụp màn hình terminal hướng dẫn cài đặt biến môi trường)]
    5.3.2 Giao diện hội thoại Telegram thường nhật
      [figure: Ảnh chụp giao diện trò chuyện thường nhật (Ảnh chụp màn hình hội thoại giữa User và Bot Telegram trên điện thoại/máy tính)]
    5.3.3 Giao diện đề xuất nén & Duyệt lưu kỹ năng mới (Consolidation UI Prompt)
      [figure: Ảnh chụp giao diện đề xuất nén và lưu kỹ năng (Ảnh chụp màn hình hiển thị đề xuất markdown SKILL.md kèm các nút bấm xác nhận/chỉnh sửa)]
    5.3.4 Giao diện cảnh báo ranh giới bảo mật (Security boundary alerts)
      [figure: Ảnh chụp giao diện cảnh báo vi phạm bảo mật (Ảnh chụp màn hình bot từ chối truy cập file ngoài ranh giới hoặc chạy lệnh nằm ngoài whitelist)]

CHƯƠNG VI: CÀI ĐẶT VÀ KIỂM THỬ
  6.1 Môi trường cài đặt và cấu hình hệ thống
  6.2 Hiện thực hóa các cấu phần phần mềm (Implementation details)
  6.3 Kịch bản kiểm thử và Đánh giá kết quả (Evaluation results)
    6.3.1 Kết quả kiểm thử nhóm A: Quản lý nhắc nhở (Task management accuracy)
      [figure: Biểu đồ kết quả kiểm thử độ chính xác quản lý nhắc nhở (Biểu đồ cột thể hiện tỷ lệ thành công của việc nhận dạng ý định hẹn giờ qua các câu test)]
    6.3.2 Kết quả kiểm thử nhóm B: Nén và duy trì ngữ cảnh (Context retention)
      [figure: Biểu đồ so sánh lượng token trước và sau khi compaction (Biểu đồ đường thể hiện lượng token tiết kiệm được qua các chuỗi hội thoại dài)]
    6.3.3 Kết quả kiểm thử nhóm C: Chất lượng trích xuất quy trình (Skill extraction quality)
    6.3.4 Kết quả kiểm thử nhóm D: Ranh giới an toàn bảo mật (Security boundary correctness)

CHƯƠNG VII: KẾT LUẬN
  7.1 Tổng kết đồ án
  7.2 Kết quả đạt được
  7.3 Khó khăn và hạn chế còn tồn tại
  7.4 Định hướng phát triển tương lai

PHỤ LỤC
  Phụ lục A: Hướng dẫn cài đặt và chạy hệ thống chi tiết
  Phụ lục B: Danh sách các Tool và JSON Schema mô tả
  Phụ lục C: Mẫu tệp SKILL.md và Workflow template

TÀI LIỆU THAM KHẢO (Được sắp xếp theo thứ tự alphabet, đặt sau Phụ lục theo quy định của UIT)
