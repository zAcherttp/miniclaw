# Chương 2: Cơ sở lý thuyết

## Tổng quan về mô hình ngôn ngữ lớn (LLM) và Prompt Engineering
Các mô hình ngôn ngữ lớn (Large Language Models – LLMs) đã trải qua một tiến trình phát triển nhanh chóng, khởi đầu từ các kiến trúc mạng nơ-ron hồi quy (RNN) và LSTM truyền thống – những mô hình vốn gặp hạn chế trong việc tính toán song song cũng như duy trì ngữ cảnh dài. Bước ngoặt quan trọng diễn ra vào năm 2017 khi Vaswani và các cộng sự đề xuất kiến trúc Transformer dựa trên cơ chế tự chú ý (self-attention). Cơ chế này cho phép mô hình tính toán mối liên hệ giữa tất cả các phần tử trong chuỗi cùng một lúc, tối ưu hóa khả năng xử lý song song quy mô lớn trên các hệ thống phần chuyên dụng (GPU). Trên nền tảng đó, các dòng mô hình ngôn ngữ tự hồi quy (autoregressive) như GPT, LLaMA, hay Qwen được huấn luyện với các tập dữ liệu lên đến hàng ngàn tỷ token, từ đó mô phỏng được cấu trúc ngôn ngữ tự nhiên và thể hiện khả năng suy luận bước đầu.

Về phương thức vận hành, các mô hình này xử lý văn bản bằng cách phân tách chuỗi ký tự đầu vào thành các đơn vị cơ sở gọi là token thông qua các thuật toán mã hóa (như Byte-Pair Encoding – BPE). Một trong những giới hạn kỹ thuật cố hữu mang tính thử thách của LLM là cửa sổ ngữ cảnh (context window) – định mức tối đa về số lượng token mô hình có thể xử lý trong một lượt gọi. Giới hạn này đã được nâng cấp đáng kể, từ mức tiêu chuẩn cũ (khoảng 8.192 token) lên tới hàng trăm ngàn, thậm chí hàng triệu token ở các kiến trúc thế hệ hiện tại. Khi độ dài phiên hội thoại vượt quá định mức này, mô hình thường gặp hiện tượng suy giảm khả năng duy trì thông tin hoặc phân tách ngữ cảnh không chính xác. Do đó, việc nghiên cứu và áp dụng các giải pháp kỹ nghệ ngữ cảnh (Context Engineering) trở thành một định hướng cần thiết.

Nhằm định hình và điều phối hành vi của LLM mà không cần can thiệp vào quá trình tái huấn luyện trọng số (fine-tuning), kỹ nghệ prompt (Prompt Engineering) đóng vai trò bổ trợ then chốt. Đây là phương pháp thiết kế cấu trúc văn bản đầu vào để tối ưu hóa hiệu suất suy luận của mô hình. Trong các kiến trúc tác nhân thông minh (AI Agent), cấu trúc prompt thường được phân rã thành hai thành phần chính:
- **System Prompt (Chỉ dẫn hệ thống):** Thiết lập cấu hình nền tảng, định hình vai trò của tác nhân, xác lập ranh giới vận hành, định dạng đầu ra và các ràng buộc logic xuyên suốt phiên làm việc.
- **User Prompt (Yêu cầu người dùng):** Tiền đề chứa nội dung tương tác trực tiếp từ người dùng, có thể tích hợp cùng dữ liệu ngữ cảnh động được truy vấn từ các nguồn tài nguyên bên ngoài.

Bên cạnh đó, việc kết hợp các kỹ thuật bổ trợ như suy luận từng bước (Chain-of-Thought), cung cấp ví dụ mẫu (Few-shot prompting) và phân tích ngữ cảnh động đóng vai trò quan trọng trong việc nâng cao độ chính xác cho quá trình ra quyết định của LLM trong vòng lặp hệ thống.

## Kiến trúc Agent và vòng lặp tác nhân (Agent Loop - ReAct)
Khác với các hệ thống hội thoại truyền thống vốn chủ yếu phản hồi đơn lượt dựa trên truy vấn đầu vào, kiến trúc tác nhân thông minh (Agentic Architecture) hướng tới việc xây dựng một vòng lặp tự động (Agent Loop). Cơ chế này cho phép mô hình duy trì tiến trình suy luận liên tục, tự đánh giá để đưa ra quyết định hành động và tương tác động với môi trường bên ngoài.

Khung lập luận phổ biến cấu thành nên vòng lặp này là ReAct (Reasoning and Acting). Phương pháp ReAct cho phép tác nhân kết hợp đan xen giữa quá trình suy luận logic và thực thi hành động thực tế. Cấu trúc cơ bản của vòng lặp ReAct bao gồm ba giai đoạn lặp lại:
1. **Thought (Suy luận):** LLM phân tích trạng thái hiện tại của phiên làm việc để làm rõ mục tiêu của người dùng, đánh giá tính đầy đủ của thông tin hiện có và hoạch định bước xử lý tiếp theo.
2. **Action (Hành động):** Mô hình quyết định lựa chọn một công cụ phù hợp từ danh sách các hàm/API đã được định nghĩa trước (ví dụ: truy vấn cơ sở dữ liệu, ghi tệp, hoặc gọi API ngoại vi) kèm theo các tham số đầu vào tương ứng dưới dạng dữ liệu cấu trúc.
3. **Observation (Quan sát):** Hệ thống thực thi công cụ trong môi trường thực tế, ghi nhận kết quả đầu ra và tích hợp thông tin này ngược trở lại ngữ cảnh hội thoại của LLM như một tiền đề mới cho lượt suy luận kế tiếp.

Vòng lặp này được duy trì cho đến khi giai đoạn *Thought* của mô hình xác định rằng mục tiêu ban đầu đã được đáp ứng đầy đủ và tiến hành xuất câu trả lời cuối cùng (*Final Answer*).

*Sơ đồ TikZ: [Hình 1: Sơ đồ vòng lặp Agent ReAct kết hợp lập luận và hành động]*

Trong các cấu hình thử nghiệm ban đầu, mô hình ReAct nguyên bản phụ thuộc nhiều vào khả năng sinh chuỗi văn bản tự do của LLM để phân tách cú pháp lệnh (ví dụ: tạo ra chuỗi định dạng đặc biệt dạng `Action: write_file`). Tuy nhiên, phương thức tạo chuỗi tự do này tiềm ẩn rủi ro sai lệch cú pháp và làm giảm tính nhất quán khi triển khai thực tế.

Do đó, các kiến trúc tác nhân hiện đại đã dịch chuyển từ cơ chế sinh văn bản tự do sang mô hình cấu trúc hóa thông qua `Tool Harness` (Bộ khung điều phối công cụ). Trong kiến trúc cải tiến này, khả năng gọi công cụ (Tool Call) được thiết kế tích hợp sâu vào tầng API của các mô hình ngôn ngữ lớn. Thay vì tự do tạo chuỗi lệnh, LLM được cung cấp danh sách định dạng đầu ra chuẩn hóa (như JSON Schema). Mô hình sẽ trực tiếp xuất ra cấu trúc JSON chứa định danh hàm và các tham số tương ứng. Tầng ứng dụng (Tool Harness) sẽ chịu trách nhiệm bắt giữ cấu trúc này, thực hiện kiểm tra kiểu dữ liệu tự động, thực thi hàm nghiệp vụ an toàn và xử lý ngoại lệ trước khi trả kết quả về cho hệ thống. Sự cải tiến này giúp nâng cao đáng kể độ ổn định và tính toàn vẹn của tác nhân trong các ứng dụng thực tế ở quy mô sản xuất (production-ready).

## Quản lý bộ nhớ tác nhân (Agent Memory)
Hệ thống bộ nhớ tác nhân đóng vai trò duy trì tính nhất quán hành vi của trợ lý ảo qua các phiên làm việc kéo dài, mô phỏng mô hình nhận thức nhằm hỗ trợ quá trình cá nhân hóa trải nghiệm tương tác. Kiến trúc bộ nhớ này thường được phân tầng thành hai lớp chính:

### Bộ nhớ ngắn hạn (Short-term chat history)
Bộ nhớ ngắn hạn chịu trách nhiệm duy trì ngữ cảnh tương tác tức thời trong phiên làm việc hiện tại. Thành phần này được hiện thực hóa bằng cách lưu trữ toàn bộ chuỗi các thông điệp hoán đổi (bao gồm truy vấn của người dùng, phản hồi của tác nhân, các lượt gọi công cụ và kết quả thực thi tương ứng) dưới dạng một danh sách tuyến tính có thứ tự. Danh sách này được tích hợp trực tiếp vào cửa sổ ngữ cảnh của LLM trong mỗi lượt gọi API kế tiếp. Khi tần suất hội thoại tăng lên, dung lượng bộ nhớ ngắn hạn sẽ gia tăng đáng kể, từ đó gây áp lực lên giới hạn biên của cửa sổ ngữ cảnh mô hình.

### Bộ nhớ dài hạn (Long-term vector Memory)
Bộ nhớ dài hạn đảm nhận việc lưu trữ các sự kiện, thông tin cấu hình và thói quen mang tính bền vững của người dùng xuyên suốt các phiên làm việc dài hạn. Lớp bộ nhớ này không thể chèn toàn bộ vào cấu trúc prompt do những hạn chế về mặt định mức token cũng như chi phí tính toán toán tử. Vì vậy, các thông tin dài hạn được phân tách thành các phân đoạn văn bản độc lập và lưu trữ trong một cơ sở dữ liệu vector (Vector Database) ngoại vi [memverge2026memmachine].

Quy trình truy vấn và lưu trữ dữ liệu dài hạn dựa trên mô hình nhúng văn bản (Text Embedding) để nhúng các phân đoạn ngôn ngữ thành các vector số thực đa chiều, số chiều của vector phụ thuộc vào loại mô hình nhúng được sử dụng (ví dụ: 768 hoặc 1536 chiều). Khi tiếp nhận yêu cầu mới, hệ thống chuyển đổi truy vấn đó thành một vector đại diện $u$ và thực hiện tìm kiếm tương đồng ngữ nghĩa trên không gian lưu trữ của các vector ký ức $v$ thông qua độ đo tương đồng Cosine (Cosine Similarity):

$$
\text{CosineSimilarity}(u, v) = \frac{u \cdot v}{\|u\| \|v\|} = \frac{\sum_{i=1}^{n} u_i v_i}{\sqrt{\sum_{i=1}^{n} u_i^2} \sqrt{\sum_{i=1}^{n} v_i^2}}
$$

Các phân đoạn ký ức có chỉ số tương đồng cao nhất (vượt qua ngưỡng cấu hình hệ thống) sẽ được trích xuất động và bổ sung vào prompt dưới dạng ngữ cảnh tham chiếu bổ trợ, cho phép tác nhân tái hiện thông tin lịch sử một cách có chọn lọc [yu2026agentic].

*Sơ đồ TikZ: [Hình 2: Sơ đồ cấu trúc phân tầng bộ nhớ tác nhân ngắn hạn và dài hạn]*

## Kỹ nghệ ngữ cảnh (Context Engineering) và cơ chế tự động nén
Trong các hệ thống tác nhân thông minh vận hành theo mô hình kiểm soát trạng thái liên tục (stateful), việc điều phối dung lượng ngữ cảnh trở thành một yếu tố kỹ thuật cần được cân nhắc kỹ lưỡng. Cửa sổ ngữ cảnh của các mô hình ngôn ngữ lớn không chỉ có giới hạn biên cố định, mà chi phí tính toán cùng độ trễ phản hồi (latency) thường tỷ lệ thuận với khối lượng dữ liệu đầu vào. Do đó, kỹ nghệ ngữ cảnh (Context Engineering) tập trung vào bài toán quản lý ngân sách token (token budgeting) một cách tối ưu.

Hệ thống đề xuất triển khai cơ chế tự động nén ngữ cảnh (Context Compaction) dựa trên các định mức kích hoạt cụ thể nhằm tối ưu hóa tài nguyên ngữ cảnh ngắn hạn. Trong cấu hình thử nghiệm, ngưỡng kích hoạt nén hệ thống được thiết lập ở định mức **50.000 token** (compaction trigger tokens). Khi bộ đếm dữ liệu ghi nhận tổng độ dài lịch sử thông điệp vượt quá định mức này, tiến trình nén ngữ cảnh ngầm sẽ tự động được khởi chạy theo các giai đoạn sau:
1. **Phân tách lịch sử:** Hệ thống chủ động giữ lại một số lượng thông điệp cố định gần nhất (ví dụ: 10 lượt tương tác gần nhất) nhằm duy trì tính liên tục của mạch hội thoại tức thời.
2. **Tóm tắt ngữ cảnh:** Các phân đoạn thông điệp cũ hơn được chuyển đến một phân hệ LLM tóm tắt chuyên biệt kèm theo các chỉ dẫn cấu trúc để trích xuất thông tin cốt lõi.
3. **Cập nhật hồ sơ dữ liệu:** Phân hệ LLM thực hiện phân tích và hoàn tác hai luồng dữ liệu cấu trúc hóa:
   - Một bản ghi tóm tắt súc tích các sự kiện chính hoặc các tác vụ đã được giải quyết thành công.
   - Các thông tin cập nhật bổ sung vào hồ sơ người dùng (User Profile), ví dụ như các cấu hình lịch trình mới được thiết lập.
4. **Giải phóng bộ lưu vết (Checkpointer):** Hệ thống đồng bộ kết quả tóm tắt mới vào bộ lưu trữ trạng thái lâu dài, đồng thời giải phóng các phân đoạn dữ liệu lịch sử thô trong cơ sở dữ liệu lưu vết (checkpointer). Quá trình này giúp tối ưu hóa dung lượng bộ nhớ ngắn hạn nhưng vẫn đảm bảo tính toàn vẹn của các thực thể thông tin cốt lõi.

*Sơ đồ TikZ: [Hình 3: Quy trình điều phối và nén ngữ cảnh tự động tối ưu hóa ngân sách token]*

## Trích xuất và lưu trữ quy trình làm việc tái sử dụng được (Reusable Workflow Extraction — HITL)
Trong các hệ thống tác nhân thông minh, khi thực hiện các nhiệm vụ phức tạp, tác nhân thường phải trải qua một chuỗi dài các lượt gọi công cụ liên tiếp để tìm kiếm thông tin và khám phá ngữ cảnh (skill/context discovery). Việc liên tục lặp lại chuỗi công cụ dài này cho các yêu cầu tương tự không chỉ gây tiêu tốn tài nguyên token mà còn làm tăng độ trễ và khả năng tích lũy sai số. Để tối ưu hóa hiệu năng vận hành, mô hình **Reusable Workflow Extraction** (Trích xuất quy trình làm việc tái sử dụng được) được áp dụng nhằm tự động nhận diện, đóng gói chuỗi hành động thành một quy trình hoàn chỉnh. Khi gặp lại bài toán tương tự, tác nhân có thể "nhảy cóc" trực tiếp đến giải pháp đã được lưu trữ trước đó mà không cần thực hiện lại các bước dò đường phức tạp. Để đảm bảo tính chính xác của quy trình được trích xuất, cơ chế **Human-in-the-loop** (HITL - Sự tham gia kiểm soát của con người) được tích hợp để người dùng duyệt và hiệu chỉnh trước khi lưu trữ.

Nguyên lý hoạt động của quy trình này dựa trên việc nhận diện các chuỗi hành động có tính tuần hoàn. Trong tiến trình điều phối và nén ngữ cảnh phiên, hệ thống thực hiện phân tích nhằm phát hiện các khuôn mẫu lệnh mà người dùng thường xuyên yêu cầu theo một trình tự logic cố định (ví dụ: truy vấn dữ liệu định kỳ, lọc thông tin phân đoạn, hoặc thiết lập nhắc nhở đồng bộ). Thay vì yêu cầu người dùng phải lặp lại các bước thiết lập này một cách thủ công, tác nhân sẽ chủ động đề xuất đóng gói trình tự đó thành một quy trình làm việc (workflow/skill) có khả năng tái sử dụng.

Quy trình tương tác HITL này được hiện thực hóa qua các giai đoạn sau:
1. **Đề xuất quy trình:** Hệ thống khởi tạo mã nguồn cấu trúc hoặc tập chỉ dẫn cho quy trình mới dưới dạng một tệp tài liệu chuẩn hóa, mô tả tường minh logic điều khiển và lưu vết tạm thời dưới định dạng `SKILL.md`.
2. **Yêu cầu phê duyệt:** Tác nhân thiết lập một luồng hội thoại phụ để thông báo đến người dùng về cấu trúc quy trình được đề xuất, giải trình các hành vi tự động hóa tương ứng và ghi nhận phản hồi kiểm soát thông qua kênh giao tiếp ngoại vi (Telegram Bot API).
3. **Nạp động quy trình (Dynamic Loading):**
   - Nếu người dùng chấp thuận (*Approve*), tệp cấu trúc sẽ được chuyển từ trạng thái tạm thời sang lưu trữ chính thức tại thư mục vận hành (`workflows`). Hệ thống tiến hành quét dữ liệu và nạp động (dynamic loading) cấu hình này vào danh mục công cụ khả dụng của tác nhân mà không yêu cầu khởi động lại máy chủ.
   - Nếu người dùng từ chối (*Reject*), hệ thống sẽ thực hiện giải phóng bản nháp, hủy bỏ đề xuất và khôi phục lại trạng thái vận hành cốt lõi ban đầu.

*Sơ đồ TikZ: [Hình 4: Sơ đồ vòng lặp phản hồi Human-in-the-loop phê duyệt quy trình làm việc mới]*

## Kỹ nghệ bộ công cụ tác nhân (Agent Tool Harness)
Bộ công cụ tác nhân (Tool Harness) đóng vai trò là giao diện trung gian chịu trách nhiệm thiết lập kết nối giữa phân hệ suy luận cốt lõi (LLM) với môi trường thực thi của hệ điều hành và các dịch vụ mạng ngoại vi. Thành phần này chuyển hóa các đầu ra suy luận trừu tượng của mô hình thành các thao tác xử lý dữ liệu hoặc tương tác hệ thống cụ thể.

### Khái niệm Tool Harness và vai trò trong vòng lặp Agent
Một công cụ (Tool) trong kiến trúc đề xuất được đặc tả bởi hai thành phần bắt buộc:
- **JSON Schema:** Bản mô tả chi tiết bao gồm định danh công cụ, chức năng nghiệp vụ bằng ngôn ngữ tự nhiên (hỗ trợ LLM định tuyến chính xác thời điểm sử dụng) và cấu trúc kiểu dữ liệu của các tham số đầu vào.
- **Implementation Function:** Hàm xử lý mã nguồn (hiện thực bằng ngôn ngữ lập trình hệ thống như TypeScript/Python) chịu trách nhiệm tiếp nhận các tham số đã qua xác thực từ mô hình để tiến hành xử lý logic nghiệp vụ.

Vòng lặp tác nhân tích hợp Tool Harness vận hành theo cơ chế thống nhất: LLM tiếp nhận toàn bộ ngữ cảnh phiên cùng danh sách cấu trúc của các công cụ khả dụng. Khi mô hình phát ra yêu cầu gọi công cụ (Tool Call Request), bộ điều phối hệ thống sẽ bắt giữ thông điệp, ánh xạ định danh công cụ với hàm xử lý tương ứng đã đăng ký, thực thi tiến trình an toàn và hoàn trả kết quả thu được về lại không gian ngữ cảnh của mô hình cho lượt xử lý tiếp theo.

### LangGraph và sự trừu tượng hóa đồ thị trạng thái
Thư viện LangGraph cung cấp một mô hình trừu tượng hóa vòng lặp tác nhân dưới dạng Đồ thị có hướng (State Graph). Trong kiến trúc này, trạng thái chung của hệ thống (bao gồm lịch sử thông điệp và các biến trạng thái nội bộ) được phân phối qua các nút (Nodes) và được điều phối dòng chảy bởi các cạnh (Edges):
- **Nút Agent (Agent Node):** Chứa mô hình ngôn ngữ lớn, có nhiệm vụ tiếp nhận trạng thái hiện tại của đồ thị để đưa ra phản hồi trực tiếp cho người dùng hoặc phát ra yêu cầu gọi công cụ phụ trợ.
- **Nút Công cụ (Tools Node):** Tiếp nhận các yêu cầu gọi hàm từ trạng thái đồ thị, thực thi song song hoặc tuần tự các tiến trình tương ứng trong bộ khung Tool Harness, thu thập kết quả và cập nhật dữ liệu trở lại dòng trạng thái.
- **Cạnh điều kiện (Conditional Edge):** Thực hiện kiểm tra logic xem thông điệp cuối cùng trong trạng thái đồ thị có tồn tại cấu trúc gọi công cụ hay không. Nếu có, cạnh điều kiện sẽ định tuyến luồng điều khiển sang nút Tools Node; ngược lại, luồng xử lý sẽ được dẫn hướng về điểm kết thúc hệ thống (`__end__`).

*Sơ đồ TikZ: [Hình 5: Sơ đồ trừu tượng hóa vòng lặp tác nhân dựa trên Đồ thị trạng thái LangGraph]*

### Phân loại công cụ và ranh giới bảo mật
Các công cụ tích hợp trong hệ thống được phân lớp chặt chẽ dựa trên mức độ tác động của chúng đối với tài nguyên máy chủ nhằm xác lập các ranh giới kiểm soát an toàn phù hợp:
1. **Chỉ đọc (Read-only):** Các tác vụ truy vấn dữ liệu không làm thay đổi trạng thái hệ thống, ví dụ như đọc tệp tài liệu cấu hình, tìm kiếm ngữ nghĩa hoặc truy vấn cơ sở dữ liệu Vector.
2. **Ghi dữ liệu (Write):** Các tác vụ làm thay đổi trạng thái lưu trữ nội bộ của ứng dụng, bao gồm tạo mới thực thể lịch trình hoặc cập nhật danh mục ghi nhớ cá nhân.
3. **Có tác động phụ (Side-effect / System actions):** Các tác vụ tương tác trực tiếp với môi trường hệ điều hành máy chủ và mạng Internet, ví dụ như truyền phát thông báo qua email, tải xuống tài nguyên số hoặc thực thi các giao thức CLI phụ trợ.

Nhằm đảm bảo tính an toàn trong quá trình thực thi và kiểm soát các rủi ro từ việc tiêm nhiễm chỉ dẫn (prompt injection) dẫn đến việc kích hoạt các câu lệnh hệ điều hành ngoài ý muốn, Tool Harness thiết lập một cơ chế cô lập nghiêm ngặt. Hệ thống vận hành các tác vụ có nguy cơ cao trong môi trường hộp cát (sandbox) hạn chế đặc quyền tài nguyên, kết hợp cùng các tầng lọc và xác thực định dạng tham số đầu vào nghiêm ngặt trước khi chuyển tiếp đến tầng thực thi lõi.

## Các công nghệ và thư viện phát triển chính
Để xây dựng một hệ thống tác nhân (agent) tối ưu về mặt tài nguyên trên hạ tầng sẵn có, đồng thời đảm bảo khả năng mở rộng kiến trúc khi triển khai thực tế, đề tài tiến hành lựa chọn và tích hợp các giải pháp công nghệ cốt lõi sau đây:

### Node.js và TypeScript
Môi trường backend của hệ thống sử dụng môi trường Node.js nhờ cơ chế thực thi bất đồng bộ và hướng sự kiện (event-driven, non-blocking I/O). Đặc điểm này giúp tối ưu hóa việc xử lý các luồng dữ liệu tương tác và phản hồi theo thời gian thực của chatbot.

Nhằm quản lý mã nguồn chặt chẽ, ngôn ngữ TypeScript được áp dụng để thiết lập hệ thống kiểm tra kiểu tĩnh (static typing) nghiêm ngặt. Việc này giúp phát hiện và ngăn chặn sớm các lỗi sai sót về cấu trúc dữ liệu ngay trong quá trình phát triển (compile-time), tránh các lỗi runtime bất ngờ, đồng thời tăng tính mô-đun hóa để hệ thống dễ dàng bảo trì về lâu dài.

### Grammy — Thư viện Telegram Bot
Đối với kênh tương tác với người dùng, Grammy được lựa chọn làm thư viện giao tiếp chính với Telegram Bot API. Thư viện này đạt hiệu năng xử lý bất đồng bộ cao trong môi trường Node.js và hỗ trợ hoàn hảo cho TypeScript. Với kiến trúc phân tầng mã trung gian (middleware) mạnh mẽ, Grammy giúp hệ thống dễ dàng triển khai các bộ lọc thông điệp đầu vào, quản lý chặt chẽ vòng đời phiên trò chuyện (session) của người dùng và định dạng hiển thị giao diện phía client một cách linh hoạt.

### LangGraph — Công cụ điều phối đồ thị trạng thái
Để giải quyết bài toán quản lý logic và luồng suy luận đa bước của Agent, đề tài áp dụng LangGraph làm khung điều phối (orchestration engine) dựa trên mô hình đồ thị trạng thái (state graph). Giải pháp này giúp kiểm soát chi tiết tiến trình suy luận (reasoning), điều hướng linh hoạt giữa các trạng thái và xử lý các tác vụ gọi công cụ (tool calling) đồng thời.

Đặc biệt, tính năng duy trì điểm kiểm soát (checkpointer) của LangGraph mang lại cho hệ thống khả năng tự phục hồi trạng thái vận hành mượt mà (fault tolerance) khi đối mặt với các kịch bản gián đoạn dữ liệu hoặc ngoại lệ hệ thống.

### Ollama và các nhà cung cấp LLM ngoại vi
Về tầng mô hình ngôn ngữ lớn (LLM), hệ thống kết hợp linh hoạt giữa giải pháp cục bộ và đám mây nhằm tối ưu hóa giữa hiệu năng, chi phí và tính bảo mật:
- **Ollama:** Được sử dụng để triển khai cục bộ (self-hosted) các mô hình mã nguồn mở thế hệ mới (như LLaMA hoặc Qwen) ngay trên hạ tầng phần cứng giới hạn. Giải pháp này giúp kiểm soát hoàn toàn tính bảo mật, quyền riêng tư của dữ liệu nội bộ và đảm bảo hệ thống vận hành độc lập.
- **Các API đám mây thương mại:** Song song đó, một cơ chế chuyển đổi dự phòng (fallback mechanism) được thiết kế sẵn. Khi đối mặt với các tác vụ phức tạp yêu cầu năng lực suy luận chuyên sâu mà mô hình local chưa đáp ứng tốt, hệ thống sẽ tự động chuyển hướng gọi các API ngoại vi mạnh hơn để đảm bảo chất lượng phản hồi cho người dùng.

*Sơ đồ TikZ: [Hình 6: Sơ đồ phân tầng cấu trúc tích hợp công nghệ trong hệ thống tác nhân]*
