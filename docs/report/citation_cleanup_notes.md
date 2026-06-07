# Citation / Abbreviation Cleanup Notes

File này ghi quyết định duyệt citation/từ viết tắt theo từng chương. Chưa sửa LaTeX chính cho đến khi rà đủ 6 chương.

## Chương I - Tổng quan

### Đã duyệt để thêm vào danh mục từ viết tắt
- `AI` - Artificial Intelligence - Trí tuệ nhân tạo.
- `AHE` - Agentic Harness Engineering - Kỹ thuật thiết kế khung công cụ tác nhân.
- `MAPE-K` - Monitor, Analyze, Plan, Execute over Knowledge - Vòng lặp tự thích ứng dựa trên kho tri thức.

### Đã duyệt để thêm / chỉnh citation
- Thêm citation nền cho xu hướng LLM-based autonomous agents:
  - Bib key đề xuất: `wang2023surveyagents`
  - Nguồn: `A Survey on Large Language Model based Autonomous Agents`
  - URL: `https://arxiv.org/abs/2308.11432`
  - Authors theo arXiv: Lei Wang, Chen Ma, Xueyang Feng, Zeyu Zhang, Hao Yang, Jingsen Zhang, Zhiyuan Chen, Jiakai Tang, Xu Chen, Yankai Lin, Wayne Xin Zhao, Zhewei Wei, Ji-Rong Wen.
- Sửa metadata entry `yao2022react`:
  - Nguồn: `ReAct: Synergizing Reasoning and Acting in Language Models`
  - URL: `https://arxiv.org/abs/2210.03629`
  - Authors đúng theo arXiv: Shunyu Yao, Jeffrey Zhao, Dian Yu, Nan Du, Izhak Shafran, Karthik Narasimhan, Yuan Cao.
- Cite docs công nghệ được nhắc ở Chương I / phần phạm vi:
  - LangGraph docs: `https://docs.langchain.com/oss/python/langgraph`
  - LangSmith docs: `https://docs.langchain.com/langsmith`
  - grammY docs: `https://grammy.dev/`
  - Ollama docs: `https://docs.ollama.com/`
  - Google Workspace CLI: `https://github.com/googleworkspace/cli`
  - Lark CLI: `https://github.com/larksuite/cli`

### Ghi chú khi sửa LaTeX
- Chương I nên cite `wang2023surveyagents` ở đoạn lý do chọn đề tài khi nói về sự phát triển của LLM và AI Agents.
- Docs công nghệ có thể cite ở Chương I phần phạm vi, nhưng nếu lặp nhiều ở Chương II/V thì ưu tiên cite lần chính tại Chương II hoặc Chương V để tránh dày nguồn.

## Chương II - Cơ sở lý thuyết

### Đã duyệt để thêm vào danh mục từ viết tắt
- `RNN` - Recurrent Neural Network - Mạng nơ-ron hồi quy.
- `LSTM` - Long Short-Term Memory - Bộ nhớ dài ngắn hạn.
- `BPE` - Byte-Pair Encoding - Mã hóa cặp byte / phương pháp tách subword.
- `GPT` - Generative Pre-trained Transformer - Mô hình Transformer sinh tiền huấn luyện.

### Đã duyệt để thêm citation
- Transformer:
  - Bib key đề xuất: `vaswani2017attention`
  - URL: `https://arxiv.org/abs/1706.03762`
  - Dùng cho đoạn "Năm 2017, Vaswani và cộng sự đề xuất kiến trúc Transformer..."
- Byte-Pair Encoding / subword tokenization:
  - Bib key đề xuất: `sennrich2015bpe`
  - URL: `https://arxiv.org/abs/1508.07909`
  - Dùng cho đoạn LLM phân tách văn bản thành token bằng BPE.
- Context engineering / context rot / compaction:
  - Bib key đề xuất: `anthropic2025contextengineering`
  - URL: `https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents`
  - Dùng cho đoạn chuyển dịch từ prompt engineering sang context engineering và phần compaction.
- Structured tool/function calling:
  - Bib key đề xuất: `openaiFunctionCallingDocs`
  - URL: `https://platform.openai.com/docs/guides/function-calling`
  - Dùng cho đoạn structured tool call và JSON Schema.
- LangGraph docs:
  - Bib key đề xuất: `langgraphDocs`
  - URL: `https://docs.langchain.com/oss/python/langgraph`
  - Dùng cho mục LangGraph và trừu tượng hóa đồ thị trạng thái.
- Node.js docs:
  - Bib key đề xuất: `nodejsDocs`
  - URL: `https://nodejs.org/docs/latest/api/`
  - Dùng cho mô tả event-driven, non-blocking I/O.
- TypeScript docs:
  - Bib key đề xuất: `typescriptDocs`
  - URL: `https://www.typescriptlang.org/docs/`
  - Dùng cho mô tả static typing.
- grammY docs:
  - Bib key đề xuất: `grammyDocs`
  - URL: `https://grammy.dev/`
  - Dùng cho mục thư viện Telegram Bot.
- Ollama docs:
  - Bib key đề xuất: `ollamaDocs`
  - URL: `https://docs.ollama.com/`
  - Dùng cho mục Ollama.

### Đã duyệt để sửa nội dung khi cleanup LaTeX
- Chương II hiện mô tả "cơ sở dữ liệu vector ngoại vi", nhưng source hiện dùng `LocalFileStore` với embedding vector và cosine search cục bộ, có keyword fallback. Khi cleanup LaTeX sửa thành "kho lưu trữ cục bộ có gắn vector embedding" thay vì "vector database ngoại vi".
- Chương II nói LLM families như GPT, LLaMA, Qwen được huấn luyện trên hàng nghìn tỷ token; nên cite survey LLM hoặc bỏ mức định lượng nếu không muốn thêm citation.

## Chương III - Tổng quan về hệ thống

### Đề xuất thêm vào danh mục từ viết tắt
- Không có từ viết tắt mới bắt buộc.
- `API`, `CLI`, `HITL`, `JSON`, `LLM`, `ReAct` đã có hoặc đã được xử lý ở các chương trước.
- `gws`, `lark-cli`, `SKILL.md` nên giữ là tên công cụ/tên tệp, không đưa vào danh mục từ viết tắt.

### Đề xuất thêm / tái sử dụng citation
- Tái sử dụng `grammyDocs` cho đoạn mô tả Telegram Bot qua grammY ở phần ý tưởng thiết kế hệ thống.
- Tái sử dụng `ollamaDocs` cho đoạn fallback giữa mô hình Ollama cục bộ và API đám mây.
- Tái sử dụng `langgraphDocs` và `yao2022react` cho mục vòng lặp tương tác chính khi nói về LangGraph/ReAct.
- Tái sử dụng `openaiFunctionCallingDocs` cho mục Agent Tool Harness khi nói về JSON Schema và structured tool calling.
- Tái sử dụng `googleworkspaceCli` và `larkCli` cho đoạn allow-list công cụ ngoại vi `gws` / `lark-cli`.
- Đề xuất thêm citation bảo mật LLM:
  - Bib key đề xuất: `owaspTop10LLM`
  - URL: `https://owasp.org/www-project-top-10-for-large-language-model-applications`
  - Dùng cho đoạn Security Boundary / kiểm soát prompt injection, insecure output handling, excessive agency.

### Ghi chú khi sửa LaTeX
- Trạng thái duyệt: đã duyệt phần cleanup nội dung theo phản hồi ngày 2026-06-07.
- File hình thực tế là `figures/architecture_overview.drawio.png`; Chương III hiện include `figures/architecture_overview.drawio`. Khi cleanup nên đổi rõ sang đuôi `.drawio.png`.
- Câu "giam lỏng (sandbox) quyền truy cập tệp tin" nên sửa văn phong thành "sandbox hóa quyền truy cập tệp tin" hoặc "giới hạn quyền truy cập tệp tin trong sandbox".
- Phần message coalescing đang ghi cửa sổ 250ms; source xác nhận qua `INBOUND_BATCH_DEBOUNCE_MS = 250` và `consumeInboundBatch(... debounceMs = 250)`.
- Có thể bổ sung ngắn rằng batch bị giới hạn độ dài nội dung tổng để tránh prompt quá dài; source `consumeInboundBatch` có `maxCombinedContentLength` mặc định 1200.
- Phần Security Boundary đang đúng hướng nhưng nên diễn đạt rõ hơn: hệ thống không "chặn prompt injection" tuyệt đối, mà giảm rủi ro bằng validation đường dẫn, allow-list binary, giới hạn thư mục làm việc, timeout và giới hạn output.

## Chương IV - Phân tích và thiết kế hệ thống

### Đề xuất thêm vào danh mục từ viết tắt
- Trạng thái duyệt: đã duyệt theo phản hồi ngày 2026-06-07.
- `UC` - Use Case - Ca sử dụng.
- `ERD` - Entity-Relationship Diagram - Sơ đồ thực thể - quan hệ.
- `UML` - Unified Modeling Language - Ngôn ngữ mô hình hóa thống nhất.

### Đề xuất thêm / tái sử dụng citation
- Thêm citation nền cho các sơ đồ UML:
  - Bib key đề xuất: `omgUml251`
  - Nguồn: `OMG Unified Modeling Language Version 2.5.1`
  - URL: `https://www.omg.org/spec/UML/2.5.1`
  - Dùng ở phần giới thiệu nhóm Use Case / Activity / Sequence / Class Diagram, không cần cite lại ở từng hình.
- Thêm citation nền cho ERD:
  - Bib key đề xuất: `chen1976erModel`
  - Nguồn: Peter P. Chen, `The Entity-Relationship Model -- Toward a Unified View of Data`, ACM Transactions on Database Systems, 1976.
  - DOI: `10.1145/320434.320440`
  - Dùng ở đầu mục Logical ERD để làm rõ đây là sơ đồ dữ liệu logic, không phải schema SQL vật lý.
- Tái sử dụng citation công nghệ nếu cần ở các đoạn phân tích có nhắc cụ thể:
  - `langgraphDocs` / `yao2022react` cho Agent loop và LangGraph.
  - `openaiFunctionCallingDocs` cho tool calling / JSON Schema.
  - `googleworkspaceCli` và `larkCli` cho tích hợp `gws` / `lark-cli`.
  - `grammyDocs` cho giao diện Telegram.

### Ghi chú khi sửa LaTeX
- Nên chuẩn hóa cách gọi đầu mục thành "Sơ đồ ca sử dụng (Use Case Diagram)", "Sơ đồ hoạt động (Activity Diagram)", "Sơ đồ trình tự (Sequence Diagram)", "Sơ đồ thực thể - quan hệ (ERD)" để thống nhất tiếng Việt trước, thuật ngữ tiếng Anh trong ngoặc.
- Chương IV hiện có các đoạn "cần thể hiện" / "nên biểu diễn" ở mục kiến trúc tổng quan hệ thống, ví dụ trước hình layered/concurrency. Khi cleanup nên đổi sang mô tả đã hoàn thành: "Hình ... thể hiện..." để tránh cảm giác còn là placeholder.
- Các screenshot Telegram/CLI trong mục giao diện đang dùng file ảnh thật; khi cleanup chỉ cần kiểm tra path và kích thước, không cần chuyển các hình này sang Chương V.
- Phần ERD và Class Diagram đã có bảng giải thích. Khi cleanup chỉ rà lại thuật ngữ "logical/file-based" và nhấn mạnh quan hệ là ràng buộc ứng dụng, không phải foreign key vật lý.
- Không cần cite cho từng UC/activity/sequence riêng vì đây là kết quả phân tích từ source MiniClaw; citation nền UML + ERD là đủ.

## Chương V - Cài đặt và kiểm thử

### Đề xuất thêm vào danh mục từ viết tắt
- `OAuth` - Open Authorization - Giao thức ủy quyền mở.

### Đề xuất thêm / tái sử dụng citation
- Tái sử dụng `nodejsDocs` cho yêu cầu Node.js v20+ và môi trường chạy.
- Tái sử dụng `ollamaDocs` cho tùy chọn chạy mô hình cục bộ.
- Tái sử dụng `grammyDocs` hoặc thêm citation Telegram Bot chính thức cho phần tạo bot/token:
  - Bib key đề xuất nếu thêm riêng: `telegramBotsDocs`
  - URL: `https://core.telegram.org/bots`
  - Dùng cho đoạn tạo bot bằng BotFather và kiểm tra qua Telegram.
- Tái sử dụng `googleworkspaceCli` và `larkCli` cho phần xác thực `gws` / `lark-cli`.
- Thêm citation cho framework kiểm thử nếu muốn chú thích `npm test`/Vitest:
  - Bib key đề xuất: `vitestDocs`
  - URL: `https://vitest.dev/`
  - Dùng cho đoạn kiểm thử tự động bằng Vitest, không bắt buộc nếu muốn giữ bibliography gọn.

### Ghi chú khi sửa LaTeX
- Trạng thái kiểm thử đã xác nhận ngày 2026-06-07: `npm test` pass, `15/15` test files và `106/106` test cases.
- Chương V đã đúng định hướng dùng `npm`, không nhắc `pnpm`; giữ nguyên cách hướng dẫn này.
- Một số câu vẫn mang giọng checklist ảnh như "Hình ... cần chụp", "cần thể hiện", "cần cho thấy". Khi cleanup đổi sang giọng báo cáo đã hoàn tất, ví dụ "Hình ... thể hiện...".
- Phần nguồn Google Workspace CLI và Lark CLI hiện đang ghi trực tiếp bằng `\url{...}`. Khi thêm BibTeX, nên chuyển thành `\cite{googleworkspaceCli,larkCli}` hoặc giữ URL trực tiếp nhưng phải thống nhất với các chương khác.
- Phần kết quả kiểm thử thủ công là đợt kiểm thử mẫu. Khi cleanup nên giữ ngôn ngữ "mẫu/trên môi trường cá nhân" để không tạo cảm giác benchmark quy mô lớn.
- Các ảnh Telegram đã được đặt ở Chương IV mục giao diện; Chương V chỉ giữ ảnh cài đặt/config/daemon/auth và bảng kết quả kiểm thử.

## Chương VI - Kết luận

### Đề xuất thêm vào danh mục từ viết tắt
- Không có từ viết tắt mới bắt buộc nếu `OAuth` đã được thêm ở Chương V.
- Các thuật ngữ `LLM`, `CLI`, `API`, `HITL` đã có ở các chương trước.

### Đề xuất thêm / tái sử dụng citation
- Chương VI là phần tổng kết, hạn chế và hướng phát triển nên không cần thêm nhiều citation mới.
- Có thể tái sử dụng citation đã có nếu đoạn tổng kết nhắc rõ công nghệ:
  - `langgraphDocs` cho LangGraph.
  - `googleworkspaceCli` và `larkCli` cho hạn chế phụ thuộc CLI ngoài.
  - `owaspTop10LLM` nếu kết luận nhấn mạnh ranh giới bảo mật cho Agent có quyền gọi công cụ.

### Ghi chú khi sửa LaTeX
- Phần hướng phát triển đã đúng với trạng thái repo hiện tại: memory hiện có semantic search bằng embedding vector, cosine similarity và keyword fallback; không nên viết như thể "cần thêm vector search" nữa.
- Hướng phát triển connector mở rộng là hợp lý và nên giữ là trọng tâm chính.
- Chương VI không nên đưa thêm số liệu mới ngoài các số đã xuất hiện ở Chương V; chỉ tổng kết định tính.
- Có thể làm mềm một số cụm tiếng Anh liên tiếp trong kết luận như "prototype", "single-user", "production", "workflow", "connector" bằng cách thêm diễn giải tiếng Việt ở lần đầu xuất hiện nếu đoạn bị dày thuật ngữ.
