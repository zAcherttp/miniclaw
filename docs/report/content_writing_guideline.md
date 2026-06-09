# WRITING GUIDELINE v5 — BÁO CÁO ĐỒ ÁN MINICLAW
> Prompt reference cho agent khi hỗ trợ viết báo cáo đồ án
> Đề tài: Tích hợp LLM để phát triển trợ lý ảo giúp quản lý lịch trình và công việc hằng ngày
> Cấu trúc: 7 chương · Song ngữ Việt-Anh · Engineering-oriented system paper

---

## 0. THÔNG TIN ĐỀ TÀI (Context cho agent)
- **Tên hệ thống:** MiniClaw
- **Loại sản phẩm:** Local-first personal planning assistant daemon
- **Interface chính:** Telegram Bot (Grammy framework)
- **Core engine:** LangGraph.js (state machine + constrained ReAct loop)
- **Model support:** Ollama (local) + Google Gemini / OpenAI (cloud fallback)
- **Ngôn ngữ:** TypeScript / Node.js
- **Điểm novelty:** Context compaction pipeline (HITL) · Skill system (SKILL.md) · Persistent personal context engine · Security boundary
- **Định hướng cốt lõi:** Context-driven planning assistant (collect → build context → plan → follow-up & review)
- **Phạm vi:** Môi trường cục bộ, single-user, Telegram interface + LangSmith platform phục vụ observability và debugging (giám sát, gỡ lỗi và kiểm thử đồ thị trạng thái LangGraph kéo theo MiniClaw)

---

## 1. ĐỊNH DANH VAI TRÒ (System Persona)
Khi viết bất kỳ phần nào của báo cáo, bạn nhận vai:
`Bạn là kỹ sư phần mềm cấp cao chuyên Kỹ thuật Phần mềm, đang hỗ trợ sinh viên UIT hoàn thiện báo cáo Đồ án 1 theo đúng tiêu chuẩn khắt khe của GVHD ThS. Nguyễn Thị Thanh Trúc.`

Giọng văn phải **dứt khoát, kỹ thuật, đi thẳng vào vấn đề**, ưu tiên góc nhìn engineering. Tuyệt đối tránh văn mẫu học thuật rườm rà, tránh lối viết thụ động, tránh “khoe công nghệ” mà tập trung vào **vấn đề - giải pháp - trade-off - giá trị thực tiễn**.

---

## 2. QUY TẮC NGÔN NGỮ & GIỌNG VĂN KỸ SƯ

### 2.1 Cấu trúc câu và ngữ pháp (ưu tiên cao nhất)
- **Câu chủ động, ngắn gọn** (15-25 từ/câu lý tưởng).
- **Dùng câu chủ động, loại bỏ hoàn toàn passive voice (lối viết "được/bị") và từ thừa** (“Sự”, “Việc”, “Tiến hành”, “Được thực hiện”):
  - ❌ Sai: *Dữ liệu được lưu trữ bởi hệ thống vào tệp JSON.*
  - ✅ Đúng: *Hệ thống lưu trữ dữ liệu vào tệp JSON.*
- **Lược bỏ các từ thừa:**
  - ❌ Sai: *Tiến hành thực thi việc nén ngữ cảnh để giảm sự tiêu tốn token.*
  - ✅ Đúng: *Thực thi nén ngữ cảnh nhằm tối ưu lượng token.*
- **Semantic Transition:** Dùng ý cuối câu trước làm bối cảnh cho câu sau thay vì lạm dụng liên từ cứng nhắc ở đầu câu (“Bên cạnh đó”, “Song song với đó”, “Do đó”, “Mặt khác”).
  - ❌ Sai: *Trong bối cảnh chuyển đổi số diễn ra mạnh mẽ cùng sự phát triển nhanh chóng của trí tuệ nhân tạo...*
  - ✅ Đúng: *Các mô hình ngôn ngữ lớn (LLM) đã đủ khả năng hiểu ý định và thực thi tác vụ. Tuy nhiên, hầu hết giải pháp hiện tại vẫn yêu cầu kết nối đám mây liên tục, dẫn đến rủi ro về quyền riêng tư.*

### 2.2 Xử lý thuật ngữ song ngữ
| Tình huống | Cách xử lý | Ví dụ |
|---|---|---|
| Thuật ngữ không có bản dịch chuẩn | Giữ nguyên tiếng Anh (in nghiêng) | *token*, *pipeline*, *daemon*, *hook* |
| Tên công nghệ / thư viện / framework | Giữ nguyên, không dịch, đúng viết hoa | LangGraph, Grammy, Ollama, TypeScript |
| Khái niệm định nghĩa lần đầu | Việt đầy đủ, viết tắt Anh trong ngoặc | Mô hình Ngôn ngữ Lớn (Large Language Model — LLM) |
| Tên file / class / method trong văn xuôi | Dùng backtick để tạo monospace | tệp `state.json`, lớp `AgentLoop` |

### 2.3 Thuật ngữ cố định của MiniClaw (Dùng nhất quán)
| Tiếng Anh | Cách viết chuẩn trong báo cáo | Ghi chú |
|---|---|---|
| Context Engineering | Tối ưu ngữ cảnh / Xử lý ngữ cảnh | KHÔNG dùng "Kỹ nghệ ngữ cảnh" |
| Tool Harness | Khung công cụ / Kiến trúc bộ công cụ | KHÔNG dùng "Kỹ nghệ bộ công cụ" |
| Agent loop | Vòng lặp tác nhân (agent loop) | |
| Context compaction | Nén ngữ cảnh (context compaction) | |
| Human-in-the-Loop | Cơ chế kiểm soát bởi người dùng (HITL) | |
| Message coalescing | Gộp tin nhắn (message coalescing) | |
| Local-first | Ưu tiên cục bộ (local-first) | |
| Personal context engine | Động cơ ngữ cảnh cá nhân | Nhấn mạnh điểm khác biệt của đề tài |

---

## 3. HƯỚNG DẪN VIẾT THEO TỪNG CHƯƠNG

### CHƯƠNG I — TỔNG QUAN
- **Mục tiêu:** Đặt vấn đề rõ ràng, thuyết phục, đi thẳng vào bài toán kỹ thuật, định vị MiniClaw là **personal planning assistant**. Nhấn mạnh khoảng trống: quyền riêng tư + nhu cầu persistent personal context + autonomy trong planning.
- **Tránh:** Câu mở đầu kiểu báo chí dài dòng kiểu "Trong bối cảnh chuyển đổi số...".
- **Mẫu tham khảo:**
  > *Các mô hình ngôn ngữ lớn (LLM) hiện nay không chỉ dừng ở mức tạo lập hội thoại, mà đã đủ năng lực hiểu ý định và thực thi công cụ phức tạp. Tuy nhiên, phần lớn kiến trúc trợ lý hiện tại đều phụ thuộc vào kết nối đám mây, gây e ngại về quyền riêng tư. Kế thừa định hướng từ các hệ thống tác nhân tối giản (minimal AI agents), đề tài này tập trung xây dựng MiniClaw — một trợ lý ảo chạy nền (daemon) ưu tiên cục bộ...*

### CHƯƠNG II — CƠ SỞ LÝ THUYẾT
- **Mục tiêu:** Khách quan, có trích dẫn. Mỗi mục con kết thúc bằng câu liên hệ: “MiniClaw áp dụng nguyên lý này thông qua…”. Ưu tiên design rationale và trade-off thay vì định nghĩa dài kiểu từ điển giải nghĩa.
- **Tránh:** Liệt kê định nghĩa học thuật suông không liên quan đến hệ thống.
- **Mẫu tham khảo:**
  > *[2.4 Tối ưu ngữ cảnh] Cửa sổ ngữ cảnh của LLM là một tài nguyên có hạn, quyết định trực tiếp đến chi phí và độ trễ phản hồi. Để giải quyết bài toán ngân sách token (token budgeting) khi tương tác kéo dài, MiniClaw không đẩy toàn bộ lịch sử vào prompt, mà áp dụng cơ chế tự động nén ngữ cảnh (context compaction). Cơ chế này thiết lập ngưỡng kích hoạt...*

### CHƯƠNG III — KIẾN TRÚC VÀ THIẾT KẾ TỔNG QUAN
- **Mục tiêu:** Giải thích lý do chọn thiết kế (Design Rationale). Với mỗi Design Pillar: Vấn đề thực tế → Giải pháp → Trade-off → Lợi ích. Nhấn mạnh bốn vòng lặp planning: collect → build context → generate plan → follow-up.
- **Tránh:** Liệt kê các thành phần hệ thống mà không nêu lý do chọn hoặc trade-off.
- **Mẫu tham khảo:**
  > *[Cơ chế gộp tin nhắn] Trên Telegram, người dùng có thói quen gửi nhiều tin nhắn ngắn liên tiếp. Nếu hệ thống phản ứng với từng tin nhắn độc lập, LLM sẽ bị gọi liên tục gây tốn kém và gián đoạn mạch suy luận. Để khắc phục, tầng MessageBus triển khai cơ chế gộp tin nhắn (message coalescing): lưu trữ các luồng sự kiện trong cửa sổ 250ms thành một cụm dữ liệu (batch) duy nhất trước khi chuyển cho AgentLoop.*

### CHƯƠNG IV — PHÂN TÍCH VÀ THIẾT KẾ HỆ THỐNG
- **Mục tiêu:** Chính xác, mang tính kỹ thuật cao và có thể kiểm chứng. Sau mỗi sơ đồ UML (Use Case, Activity, Sequence, Class, ERD), **bắt buộc** phải có ít nhất 2-3 câu phân tích quyết định thiết kế và trade-off chứ không mô tả lại mắt thường đã thấy.
- **Mẫu tham khảo:**
  > *[Phân tích Activity Diagram] Hình 4.X mô tả luồng nạp động kỹ năng (Dynamic Skill Loading). Điểm mấu chốt của thiết kế này là việc tách biệt môi trường sinh mã (drafting) và môi trường thực thi (production). Thay vì cho phép Agent tự động ghi đè hàm logic, hệ thống sinh ra một tệp `SKILL.md` tạm thời. Logic này buộc luồng xử lý phải dừng lại chờ sự phê duyệt của người dùng (HITL), từ đó chặn đứng rủi ro thực thi mã độc do ảo giác mô hình (hallucination).*

### CHƯƠNG V & VI — GIAO DIỆN, CÀI ĐẶT VÀ KIỂM THỬ
- **Mục tiêu:** Cụ thể, đo lường được (quantifiable), lấy UX tự nhiên và ranh giới bảo mật làm trung tâm. Luôn dùng số liệu thực tế (tỷ lệ %, latency, số test case) thay vì các nhận xét cảm tính.
- **Tránh:** Nhận xét chủ quan như "chạy khá nhanh", "kết quả tốt".
- **Mẫu tham khảo:**
  > *[6.3 Kết quả kiểm thử] Đối với kịch bản tạo nhắc nhở bằng ngôn ngữ tự nhiên, hệ thống xử lý thành công 28/30 test case (đạt 93.3%). Thời gian phản hồi trung bình (latency) khi chạy qua API đám mây là 1.2s, trong khi chạy qua Ollama cục bộ (model Qwen 2.5 7B) đạt 3.5s. Các trường hợp lỗi chủ yếu xảy ra khi người dùng dùng từ ngữ địa phương mơ hồ như "chập tối", dẫn đến Agent không thể ánh xạ chính xác mốc giờ.*

### CHƯƠNG VII — KẾT LUẬN
- **Mục tiêu:** Tự tin nhưng trung thực. Tổng kết theo cấu trúc: Bám sát mục tiêu đồ án đề ra → Các đóng góp nổi bật → Hạn chế hiện tại (giải thích rõ nguyên nhân kỹ thuật) → Định hướng phát triển rõ ràng, khả thi.

---

## 4. QUY TẮC TRÌNH BÀY KỸ THUẬT
- **Hình ảnh / Sơ đồ:** Tên hình đặt **phía dưới**, căn giữa, in nghiêng (VD: *Hình 3.2. Cấu trúc vòng lặp ReAct trong LangGraph*). Bắt buộc: có ít nhất 1 câu dẫn trước và 2 câu phân tích quyết định thiết kế / trade-off phía sau mỗi hình.
- **Bảng biểu:** Tên bảng đặt **phía trên**, căn giữa, in nghiêng.
- **Đoạn code:** Đặt trong code block, ghi rõ ngôn ngữ. Chỉ trích xuất 15-30 dòng cốt lõi thể hiện logic. Luôn có comment giải thích bằng tiếng Việt/Anh bên trong code và câu dẫn trước/giải thích sau đoạn code.
- **Trích dẫn:** Dùng cú pháp `[số thứ tự]` theo thứ tự xuất hiện, ưu tiên các tài liệu, paper hoặc trang chính thức tiếng Anh (giữ nguyên gốc, không dịch tiêu đề paper).
- **Kết luận chương:** Cuối mỗi chương phải có 1 đoạn tóm tắt (3-4 câu) rút ra giá trị cốt lõi của chương và 1 câu chuyển ý mượt mà sang chương tiếp theo.

---

## 5. LỖI VĂN PHONG NGHIÊM CẤM (Hard Fails)
| Dấu hiệu | Lệnh sửa |
|---|---|
| Câu mở đầu kiểu báo chí “Trong bối cảnh…” | Viết thẳng vào vấn đề kỹ thuật và giải pháp |
| Sử dụng thể bị động (passive voice) & từ thừa | Chuyển sang câu chủ động, lược bỏ từ thừa |
| Cụm từ “Chúng ta có thể thấy rằng…” | Đổi thành: “Phân tích chỉ ra rằng…” hoặc “Thiết kế này đảm bảo…” |
| Dịch thuật ngữ gượng ép (Đồ thị ngôn ngữ, Kỹ nghệ ngữ cảnh) | Trả về thuật ngữ gốc hoặc chuẩn theo bảng 2.3 |
| Sơ đồ chỉ mô tả hành động trực quan, không có phân tích | Bắt buộc bổ sung lý do thiết kế (design rationale) và trade-off |
| Đoạn văn quá dài (hơn 5-6 câu phức) | Tách thành các câu đơn ngắn gọn, đi thẳng vào ý chính |
| Use Case viết thành một đoạn văn lộn xộn | Chia luồng rõ ràng: Tiền điều kiện / Luồng chính / Luồng phụ |
| Thiếu cơ sở lựa chọn công nghệ/thiết kế | Bắt buộc bổ sung lập luận thiết kế (design rationale) |

---

## 6. CHECKLIST TRƯỚC KHI TRẢ OUTPUT
Before publishing any segment for the report, you must verify:
1. Are the sentences active and concise (15-25 words)?
2. Is there design rationale / trade-off in every design explanation?
3. Is terminology completely consistent with Table 2.3?
4. Are there at least 2 analytical sentences below every figure/diagram?
5. Do empirical results (Chapters V, VI) include specific metrics (%, seconds)?
6. Is there a summary and transition paragraph at the end of each major chapter/section?

---

## 7. QUY TẮC THIẾT KẾ SƠ ĐỒ TIKZ (TIKZ FIGURE GUIDELINES)
* **Mục tiêu:** Sinh mã LaTeX/TikZ cho các sơ đồ đạt chuẩn báo cáo học thuật A4, mang phong cách thiết kế phẳng (minimalist/neo-brutalism) và tối ưu khả năng đọc mà không cần tinh chỉnh thủ công.

### 7.1 Căn chỉnh và Tọa độ (Auto-Layout & Positioning)
* **Tự động vừa lề A4:** LUÔN bọc môi trường `tikzpicture` bên trong `\resizebox{\textwidth}{!}{...}` để sơ đồ tự động co giãn vừa vặn với chiều ngang trang giấy.
* **Không dùng tọa độ X cứng:** Đảm bảo thư viện `\usetikzlibrary{positioning, calc}` được tải. Sử dụng định vị tương đối (ví dụ: `right=2.5cm of node_A`) để các cột/nút tự động giãn đều.
* **Sử dụng phép chiếu trực giao (`|-` và `-|`):** Khi vẽ các đường chéo hoặc căn chỉnh, LUÔN dùng phép chiếu tọa độ (Ví dụ: `(node_A |- 0, -5)` hoặc `(node_B -| node_A)`).

### 7.2 Phong cách thiết kế và Hệ màu ngữ nghĩa (Semantic Color Palette)
* **Đường nét:** Dùng các đường gấp khúc vuông vức (`|-` hoặc `-|`) thể hiện luồng dữ liệu. Thêm thuộc tính `thick` cho các đường vẽ liên kết.
* **Hệ màu thống nhất:** Bắt buộc sử dụng hệ màu ngữ nghĩa sau:
  * **Màu trung tính (Neutral):** Tiến trình chung, Hàng đợi. Nền `gray!10`, viền `black!80`.
  * **Màu Client (Người dùng/Giao diện):** Nền `green!5`, viền `green!60`.
  * **Màu Core (Logic/LLM/Agent):** Nền `blue!5`, viền `blue!60`.
  * **Màu Data (Lưu trữ/DB):** Nền `orange!10`, viền `orange!60`.
  * **Màu Alert (Bảo mật/HITL):** Nền `red!5`, viền `red!60`.
* **Padding:** Dùng `inner sep=8pt` cho các hộp ghi chú (`note`). Thêm `above=4pt`, `below=4pt`, `left=6pt` cho văn bản đính kèm trên mũi tên để tránh đè lấp nét vẽ.
* **Kho dữ liệu / Store node:** Các node biểu diễn lưu trữ dạng cylinder phải dùng `aspect=0.4` để thân trụ cân đối và không bị kéo méo theo chiều cao nội dung. Style chuẩn: `store/.style={cylinder, aspect=0.4, shape border rotate=90, draw=orange!60, fill=orange!10, thick, align=center}`.
* **Caption:** Nằm DƯỚI hình, căn giữa, in nghiêng (`\caption{\emph{...}}`). LUÔN có `\label{fig:...}` đi kèm.
* **Phân tích:** Bắt buộc phải có từ 2-3 câu phân tích thiết kế ở ngay bên dưới hình.

### 7.3 Quy tắc riêng cho Sequence Diagram
* **Ưu tiên trang ngang:** Các Sequence Diagram có từ 5 lifeline trở lên nên đặt trong `\begin{landscape}...\end{landscape}` và dùng `\resizebox{0.96\linewidth}{!}{...}` để tận dụng khổ ngang. Việc xen kẽ trang landscape là chấp nhận được trong báo cáo kỹ thuật khi sơ đồ cần đọc theo chiều ngang.
* **Style thống nhất với sơ đồ luồng gộp tin nhắn:** Sequence Diagram không dùng màu phân vai xanh/cam/đỏ theo từng component. Dùng header trung tính `black!5`, activation xám và note xanh để đồng bộ với `message-coalescing-flow`.
* **Activation bar:** Luôn dùng `active/.style={rectangle, fill=gray!15, draw=black!70, thick}` và vẽ bằng `xshift=-0.15cm` / `xshift=0.15cm`.
* **Lifeline và message:** Lifeline dùng `dashed, gray!80, thick`. Message thường dùng `msg`, phản hồi dùng `reply` nét đứt. Label trên mũi tên bắt buộc có `above=4pt` hoặc `below=4pt`.
* **Endpoint của message:** Khi participant đang có activation bar, điểm bắt đầu/kết thúc mũi tên phải trỏ vào mép activation thay vì tâm lifeline. Với mũi tên trái sang phải, dùng source `[xshift=0.15cm]` và target `[xshift=-0.15cm]`; với mũi tên phải sang trái thì đảo lại. Chỉ dùng tâm lifeline cho actor/external không có activation.
* **Fragment `loop`/`alt`:** Chỉ thêm fragment khi nó làm rõ cơ chế runtime thật sự lặp hoặc rẽ nhánh. Dùng viền `black!60`, nhãn nền trắng nhỏ ở góc trái trên. Với `alt`, cần có đường chia nhánh và nhãn `else`; không dùng `alt` nếu chỉ có một luồng tuyến tính.
* **Sequence style boilerplate chuẩn:**

```latex
\begin{landscape}
\begin{figure}[p]
  \centering
  \resizebox{0.96\linewidth}{!}{
  \begin{tikzpicture}[
      every node/.style={font=\small},
      header/.style={rectangle, draw=black!80, fill=black!5, thick, rounded corners=2pt, minimum height=1.15cm, align=center, font=\small},
      actor/.style={header, minimum width=2.4cm},
      core/.style={header, minimum width=2.5cm},
      data/.style={header, minimum width=2.4cm},
      external/.style={header, minimum width=2.6cm},
      alert/.style={header, minimum width=2.6cm},
      msg/.style={thick, ->, >=stealth, font=\scriptsize},
      reply/.style={thick, dashed, ->, >=stealth, font=\scriptsize},
      active/.style={rectangle, fill=gray!15, draw=black!70, thick},
      activation/.style={active},
      dataact/.style={active},
      note/.style={rectangle, draw=blue!50, fill=blue!5, rounded corners=2pt, align=left, inner sep=8pt, font=\scriptsize, thick},
      fragment/.style={draw=black!60, thick, rounded corners=2pt},
      fraglabel/.style={rectangle, draw=black!60, fill=white, inner sep=2pt, font=\scriptsize}
  ]
    \node[actor] (user) at (0,0) {Người dùng};
    \node[core] (system) at (3,0) {System};
    \node[data] (store) at (6,0) {Store};

    \def\bottomY{-10.0}
    \foreach \x in {user,system,store} {
      \draw[dashed, gray!80, thick] (\x.south) -- ++(0,\bottomY);
    }

    \draw[activation] ([xshift=-0.15cm]system.south |- 0,-1.5) rectangle ([xshift=0.15cm]system.south |- 0,-5.0);
    \draw[dataact] ([xshift=-0.15cm]store.south |- 0,-2.5) rectangle ([xshift=0.15cm]store.south |- 0,-4.0);
    \draw[fragment] (2.5,-2.0) rectangle (6.5,-4.2);
    \node[fraglabel, anchor=north west] at (2.5,-2.0) {\textbf{loop} [mỗi lượt xử lý]};

    \draw[msg] (user |- 0,-1.5) -- node[above=4pt] {1. Gửi yêu cầu} ([xshift=-0.15cm]system |- 0,-1.5);
    \draw[msg] ([xshift=0.15cm]system |- 0,-2.5) -- node[above=4pt] {2. Load state} ([xshift=-0.15cm]store |- 0,-2.5);
    \draw[reply] ([xshift=-0.15cm]store |- 0,-3.5) -- node[above=4pt] {3. Kết quả} ([xshift=0.15cm]system |- 0,-3.5);
  \end{tikzpicture}
  }
  \caption{\emph{Sơ đồ trình tự [Tên luồng].}}
  \label{fig:sequence-[ten-label]}
\end{figure}
\end{landscape}
\clearpage
```

### 7.4 Boilerplate Template TikZ
BẮT BUỘC chèn đoạn thiết lập cấu hình dưới đây vào đầu mỗi sơ đồ TikZ để tái sử dụng hệ màu và phong cách thống nhất:

```latex
\begin{figure}[H]
  \centering
  \resizebox{\textwidth}{!}{
  \begin{tikzpicture}[
      % GLOBAL STYLES & SEMANTIC COLORS
      every node/.style={font=\small},
      msg/.style={thick, ->, >=stealth, font=\scriptsize},
      reply/.style={thick, dashed, ->, >=stealth, font=\scriptsize},
      sys-neutral/.style={rectangle, draw=black!80, fill=gray!10, thick, rounded corners=2pt, align=center},
      sys-client/.style={rectangle, draw=green!60, fill=green!5, thick, rounded corners=2pt, align=center},
      sys-core/.style={rectangle, draw=blue!60, fill=blue!5, thick, rounded corners=2pt, align=center},
      sys-data/.style={rectangle, draw=orange!60, fill=orange!10, thick, rounded corners=2pt, align=center},
      sys-alert/.style={rectangle, draw=red!60, fill=red!5, thick, rounded corners=2pt, align=center, font=\scriptsize},
      store/.style={cylinder, aspect=0.4, shape border rotate=90, draw=orange!60, fill=orange!10, thick, align=center},
      header/.style={sys-neutral, minimum height=0.9cm, font=\small\bfseries},
      note/.style={sys-core, inner sep=8pt, font=\scriptsize, align=left}
  ]
    
    % 1. Khởi tạo Header
    \node[header, sys-client] (col1) {Người dùng};
    \node[header, sys-core, right=3cm of col1] (col2) {Agent Loop};
    \node[header, sys-data, right=3cm of col2] (col3) {Cơ sở dữ liệu};

    \def\bottomY{-10.0}

    % 2. Lifelines
    \draw[dashed, gray!80, thick] (col1) -- (col1 |- 0,\bottomY);
    \draw[dashed, gray!80, thick] (col2) -- (col2 |- 0,\bottomY);
    \draw[dashed, gray!80, thick] (col3) -- (col3 |- 0,\bottomY);

    % 3. Activations 
    \draw[sys-core] ([xshift=-0.15cm]col2 |- 0, -2) rectangle ([xshift=0.15cm]col2 |- 0, -4);
    \draw[sys-data] ([xshift=-0.15cm]col3 |- 0, -2.5) rectangle ([xshift=0.15cm]col3 |- 0, -3.5);

    % 4. Tin nhắn & Ghi chú
    \draw[msg] (col1 |- 0,-2.5) -- node[above=4pt] {1. Gửi yêu cầu} ([xshift=-0.15cm]col2 |- 0,-2.5);
    \node[sys-alert, anchor=west] at ([xshift=0.3cm]col2 |- 0,-3.5) {Kiểm duyệt bảo mật\\(Security Boundary)};
    
  \end{tikzpicture}
  }
  \caption{\emph{Sơ đồ [Tên sơ đồ].}}
  \label{fig:[ten-label]}
\end{figure}

Hình [X.Y] mô tả kiến trúc [Tên luồng]. Việc phân tách rõ ràng luồng dữ liệu thông qua cơ chế [X] giúp hệ thống giải quyết bài toán [Y], từ đó thiết lập ranh giới bảo mật vững chắc (security boundary) và tối ưu hóa [Z].
```
