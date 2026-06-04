LỜI CẢM ƠN

Lời đầu tiên, em xin gửi lời cảm ơn sâu sắc nhất đến toàn thể quý thầy cô Trường Đại học Công nghệ thông tin – Đại học quốc gia Thành phố Hồ Chí Minh và quý thầy cô thuộc khoa Công nghệ phần mềm vì đã trang bị cho em những kiến thức nền tảng trong suốt thời gian qua.

Em cũng xin gửi lời cảm ơn đặc biệt đến Cô Nguyễn Thị Thanh Trúc – là người đã trực tiếp hướng dẫn em thực hiện đề tài “Tích hợp LLM để phát triển trợ lý ảo giúp quản lý lịch trình và công việc hàng ngày”. Trong suốt quá trình thực hiện đồ án, em đã nhận được sự hướng dẫn tận tình của Cô và những đóng góp quý báu, giúp em hoàn thành tốt báo cáo của mình.

Em cũng xin cảm ơn bạn bè và gia đình đã luôn động viên và hỗ trợ em trong quá trình thực hiện đồ án, và những người đã đồng ý thực hiện kiểm thử để góp ý những lỗi và những điểm cải thiện sau những giai đoạn thử nghiệm thực tế.

Mặc dù được thực hiện với nhiều nỗ lực, đồ án này không thể tránh khỏi những thiếu sót do lĩnh vực tích hợp mô hình ngôn ngữ lớn và phát triển tác nhân thông minh nói chung rất rộng lớn và mới mẻ đối với em, em mong được nhận những góp ý của thầy cô để có thể giúp em phát triển và hoàn thiện sản phẩm này tốt hơn trong tương lai.

\begin{flushright}
  \begin{tabular}{c}
    \it TP. Hồ Chí Minh, tháng 06 năm 2026 \\[0.3cm]
    Sinh viên thực hiện \\[0.3cm]
    \bfseries Thang Tuấn Phát
  \end{tabular}
\end{flushright}

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
    1.2.2 Tích hợp tác nhân AI và thiết kế bộ công cụ tác nhân (Tool Harness)
    1.2.3 Nghiên cứu Context Engineering và cơ chế nén ngữ cảnh tự động
    1.2.4 Triển khai quy trình tổng hợp và lưu kỹ năng (Workflow Consolidation)
    1.2.5 Rèn luyện tư duy hệ thống và kỹ năng giải quyết vấn đề thực tiễn
  1.3 Đối tượng và phạm vi nghiên cứu
    1.3.1 Đối tượng nghiên cứu (Tác nhân thông minh, Context Engineering, Tool Harness, Task Scheduling)
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
    2.3.1 Bộ nhớ ngắn hạn
    2.3.2 Bộ nhớ dài hạn
    [figure: Mô hình phân tầng bộ nhớ tác nhân (Sơ đồ so sánh đặc tính và không gian lưu trữ của bộ nhớ ngắn hạn trong ngữ cảnh hội thoại và bộ nhớ dài hạn trong vector database)]
  2.4 Kỹ nghệ ngữ cảnh (Context Engineering) và cơ chế tự động nén
    [figure: Quy trình nén và dọn dẹp ngữ cảnh (Sơ đồ mô tả lịch sử tin nhắn dài bị nén thành bản tóm tắt cô đọng thông qua LLM trước khi đẩy lại vào ngữ cảnh)]
  2.5 Tổng hợp kỹ năng với sự tham gia của người dùng (Workflow Consolidation — HITL)
    [figure: Vòng lặp phản hồi Human-in-the-loop (Sơ đồ tương tác giữa LLM đề xuất quy trình và con người duyệt/sửa đổi trước khi lưu trữ)]
  2.6 Kỹ nghệ bộ công cụ tác nhân (Agent Tool Harness)
    2.6.1 Khái niệm Tool Harness và vai trò trong vòng lặp Agent
    2.6.2 Phân loại công cụ theo mức độ tác động
    2.6.3 Cơ chế định nghĩa và đăng ký công cụ
  2.7 Các công nghệ và thư viện phát triển chính
    2.7.1 Node.js và TypeScript
    2.7.2 Grammy — Thư viện Telegram Bot
    2.7.3 LangGraph — Orchestration Engine
    2.7.4 Ollama và các nhà cung cấp LLM

CHƯƠNG III: TỔNG QUAN VỀ HỆ THỐNG
  3.1 Ý tưởng thiết kế hệ thống
    [figure: Tổng quan mô hình tương tác Miniclaw (Sơ đồ thể hiện luồng tương tác giữa User, Bot Telegram, Onboarding CLI, và các tệp cấu hình cục bộ)]
  3.2 Các nguyên tắc thiết kế cốt lõi
    3.2.1 Xử lý bất đồng bộ và gộp tin nhắn (Message Coalescing)
      [figure: Sơ đồ luồng Message Coalescing (Sơ đồ thời gian thể hiện cách MessageBus gom cụm các tin nhắn gửi liên tục trong 250ms thành một batch trước khi xử lý)]
    3.2.2 Tính bảo mật và ranh giới an toàn (Security Boundary)
    3.2.3 Nạp kỹ năng động (Dynamic Skill Loading)
  3.3 Vòng lặp hoạt động chính của hệ thống
    3.3.1 Vòng lặp trò chuyện & Thực thi lệnh thông thường
    3.3.2 Vòng lặp lập lịch nhắc nhở nền (Scheduler Daemon)
    3.3.3 Vòng lặp tổng hợp ngữ cảnh và kỹ năng (Consolidation Loop)
  3.4 Hệ thống công cụ của tác nhân (Agent Tool System)
    3.4.1 Danh sách các công cụ tích hợp
    3.4.2 Cơ chế phân quyền và kiểm soát tác động phụ

CHƯƠNG IV: PHÂN TÍCH VÀ THIẾT KẾ HỆ THỐNG
  4.1 Sơ đồ Use Case
    4.1.1 Giới thiệu sơ đồ Use Case
    4.1.2 Các tác nhân trong hệ thống
    4.1.3 Các Use Case chính
      [figure: Sơ đồ Use Case tổng thể hệ thống (Sơ đồ UML thể hiện các nhóm chức năng chính của người dùng và quản trị viên)]
    4.1.4 Đặc tả ca sử dụng chi tiết
      4.1.4.1 Xác thực truy cập kênh
      4.1.4.2 Quản lý nhắc nhở
      4.1.4.3 Thực thi và cập nhật kỹ năng
      4.1.4.4 Tự động đề xuất và duyệt lưu quy trình
  4.2 Sơ đồ hoạt động
    4.2.1 Luồng xử lý tin nhắn và vòng lặp tác nhân chính
      [figure: Sơ đồ hoạt động Vòng lặp Agent chính (Sơ đồ Activity UML mô tả chi tiết các bước từ khi nhận tin nhắn, phân tích, gọi tool, cho đến khi gửi phản hồi)]
    4.2.2 Luồng đàm thoại nén và duyệt quy trình
      [figure: Sơ đồ hoạt động đàm thoại nén và duyệt quy trình (Sơ đồ Activity UML thể hiện quy trình đề xuất kỹ năng, đàm thoại chỉnh sửa và lưu trữ tệp SKILL.md)]
    4.2.3 Luồng nhắc nhở chạy ngầm
      [figure: Sơ đồ hoạt động của TaskScheduler (Sơ đồ Activity UML mô tả quá trình quét reminders.json, thiết lập hẹn giờ và gửi nhắc nhở khi đến hạn)]
  4.3 Sơ đồ trình tự
    4.3.1 Trình tự quy trình xử lý trò chuyện và lưu bộ nhớ dài hạn
      [figure: Sơ đồ trình tự xử lý Chat và Bộ nhớ dài hạn (Sơ đồ Sequence UML thể hiện tương tác thời gian giữa User, Channel, MessageBus, AgentLoop, LangGraph và MemoryManager)]
    4.3.2 Trình tự quy trình đàm thoại nén và duyệt quy trình
      [figure: Sơ đồ trình tự đàm thoại nén và duyệt quy trình (Sơ đồ Sequence UML thể hiện các bước tương tác đồng bộ dữ liệu giữa các class khi lưu kỹ năng)]
  4.4 Thiết kế sơ đồ thực thể - quan hệ và sơ đồ lớp
    4.4.1 Sơ đồ thực thể - quan hệ logic
      4.4.1.1 Thực thể hồ sơ người dùng
      4.4.1.2 Thực thể nhắc nhở
      4.4.1.3 Thực thể ghi nhớ sự kiện
      4.4.1.4 Thực thể trạng thái ứng dụng
      [figure: Sơ đồ Thực thể - Quan hệ logic (Sơ đồ ERD thể hiện mối quan hệ logic 1-1, 1-n giữa UserProfile, AppState, Reminder, và FactMemory)]
    4.4.2 Sơ đồ lớp các thành phần chính
      [figure: Sơ đồ lớp chi tiết của hệ thống (Sơ đồ Class UML thể hiện các thuộc tính, phương thức và mối quan hệ giữa AgentLoop, MessageBus, TaskScheduler, MemoryManager...)]
  4.5 Kiến trúc tổng quan hệ thống
    4.5.1 Sơ đồ kiến trúc phân lớp tổng thể
      [figure: Sơ đồ kiến trúc phân lớp hệ thống (Sơ đồ kiến trúc mô tả 6 tầng từ Presentation, Integration đến Execution Engine và Offline Storage)]
    4.5.2 Cơ chế phân vùng dữ liệu và xử lý đồng thời
      [figure: Mô hình quản lý concurrency và isolation (Sơ đồ mô tả cách phân vùng dữ liệu và lưu checkpoint độc lập theo chatId của nhiều người dùng)]
  4.6 Thiết kế giao diện và kịch bản tương tác
    4.6.1 Yêu cầu thiết kế giao diện
    4.6.2 Sơ đồ luồng màn hình và tương tác
      [figure: Sơ đồ luồng màn hình và tương tác người dùng (Sơ đồ khối thể hiện sự chuyển đổi giữa các trạng thái giao diện CLI và Telegram Bot)]
    4.6.3 Chi tiết các kịch bản tương tác người dùng
      4.6.3.1 Giao diện khởi động và cấu hình ban đầu
        [figure: Ảnh chụp giao diện chạy lệnh pnpm dev init (Ảnh chụp màn hình terminal hướng dẫn cài đặt biến môi trường)]
      4.6.3.2 Giao diện hội thoại Telegram thường nhật
        [figure: Ảnh chụp giao diện trò chuyện thường nhật (Ảnh chụp màn hình hội thoại giữa User và Bot Telegram trên điện thoại/máy tính)]
      4.6.3.3 Giao diện tổng hợp và phê duyệt kỹ năng
        [figure: Ảnh chụp giao diện đề xuất nén và lưu kỹ năng (Ảnh chụp màn hình hiển thị đề xuất markdown SKILL.md kèm các nút bấm xác nhận/chỉnh sửa)]
      4.6.3.4 Giao diện cảnh báo ranh giới bảo mật
        [figure: Ảnh chụp giao diện cảnh báo vi phạm bảo mật (Ảnh chụp màn hình bot từ chối truy cập file ngoài ranh giới hoặc chạy lệnh nằm ngoài whitelist)]

CHƯƠNG V: CÀI ĐẶT VÀ KIỂM THỬ
  5.1 Môi trường cài đặt và cấu hình hệ thống
  5.2 Chi tiết cài đặt các thành phần chính
  5.3 Kịch bản kiểm thử và phân tích kết quả
    5.3.1 Kết quả kiểm thử nhóm A: Quản lý lịch trình và công việc hàng ngày
      [figure: Biểu đồ kết quả kiểm thử quản lý lịch trình và công việc hàng ngày (Biểu đồ cột thể hiện tỷ lệ thành công của việc lập lịch, tạo nhắc nhở và theo dõi tiến độ công việc)]
    5.3.2 Kết quả kiểm thử nhóm B: Độ chính xác gọi công cụ qua ngôn ngữ tự nhiên
      [figure: Biểu đồ kết quả kiểm thử độ chính xác gọi công cụ (Biểu đồ cột thể hiện tỷ lệ chọn đúng công cụ từ tập hợp các công cụ tích hợp)]
    5.3.3 Kết quả kiểm thử nhóm C: Nén và duy trì ngữ cảnh
      [figure: Biểu đồ so sánh lượng token trước và sau khi compaction (Biểu đồ đường thể hiện lượng token tiết kiệm được qua các chuỗi hội thoại dài)]
    5.3.4 Kết quả kiểm thử nhóm D: Chất lượng tổng hợp kỹ năng
    5.3.5 Kết quả kiểm thử nhóm E: Ranh giới an toàn bảo mật

CHƯƠNG VI: KẾT LUẬN
  6.1 Tổng kết đồ án
  6.2 Kết quả đạt được
  6.3 Khó khăn và hạn chế còn tồn tại
  6.4 Định hướng phát triển tương lai

PHỤ LỤC
  Phụ lục A: Hướng dẫn cài đặt và chạy hệ thống chi tiết
  Phụ lục B: Danh sách các công cụ và mô tả lược đồ JSON
  Phụ lục C: Mẫu tệp kỹ năng và bản mẫu quy trình

TÀI LIỆU THAM KHẢO (Được sắp xếp theo thứ tự alphabet, đặt sau Phụ lục theo quy định của UIT)
