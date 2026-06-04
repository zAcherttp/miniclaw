# UIT Course Project LaTeX Template

Template này đã được chỉnh lại để nhìn giống `Template_Do_An_Mon_Hoc_VN.docx` trong repo tham chiếu:

- Font Times-style (`newtx`)
- Lề trang 2.54 cm
- Bìa có khung đôi màu xanh và logo UIT
- Header trái/phải theo môn học và số nhóm
- Footer số trang căn giữa
- Chương theo dạng `Chương I. ...`
- Mục lục 3 cấp, caption nghiêng ở giữa

## File quan trọng

- `main-report.tex`: file build chính
- `uitcourseproject.cls`: class chứa layout và cover
- `config/project-info.tex`: sửa thông tin đề tài, môn học, nhóm, GVHD
- `config/listings.tex`: style cho code block
- `chapters/`: các file nội dung mẫu
- `bibliography/main.bib`: tài liệu tham khảo mẫu

## Cách dùng

1. Sửa `config/project-info.tex`
2. Thay nội dung các file trong `chapters/`
3. Cập nhật `bibliography/main.bib`
4. Build tài liệu sử dụng **XeLaTeX** và **Biber** (xem hướng dẫn chi tiết bên dưới).

## Thiết lập trên Windows

1. Cài [MiKTeX](https://miktex.org/download) hoặc TeX Live.
2. Cài VS Code extension `LaTeX Workshop`.

### Biên dịch qua Terminal

Sau khi cài xong, bạn có thể tự biên dịch thủ công qua Terminal bằng chuỗi lệnh sau để cập nhật đầy đủ tham chiếu tài liệu:

```powershell
xelatex main-report.tex
biber main-report
xelatex main-report.tex
xelatex main-report.tex
```

*Hoặc sử dụng `latexmk` (yêu cầu cài đặt [Strawberry Perl](https://strawberryperl.com/)):*
```powershell
latexmk -xelatex main-report.tex
```

### Cấu hình VS Code (LaTeX Workshop)

Để biên dịch tự động bằng phím tắt/phím bấm của extension **LaTeX Workshop** trong VS Code, hãy mở cấu hình cấu hình cài đặt (`settings.json`) của User hoặc tạo `.vscode/settings.json` trong dự án và dán đoạn JSON sau:

```json
{
  "latex-workshop.latex.recipes": [
    {
      "name": "xelatex -> biber -> xelatex * 2",
      "tools": [
        "xelatex",
        "biber",
        "xelatex",
        "xelatex"
      ]
    }
  ],
  "latex-workshop.latex.tools": [
    {
      "name": "xelatex",
      "command": "xelatex",
      "args": [
        "-synctex=1",
        "-interaction=nonstopmode",
        "-file-line-error",
        "%DOC%"
      ],
      "env": {}
    },
    {
      "name": "biber",
      "command": "biber",
      "args": [
        "%DOCFILE%"
      ],
      "env": {}
    }
  ]
}
```

## Ghi chú

- Template hiện tại sử dụng **XeLaTeX** (`xelatex`) để đảm bảo hỗ trợ Unicode native đầy đủ, hiển thị chính xác các ký tự tiếng Việt và dấu nháy kép thông minh (`“` và `”`) trong nội dung và cả mục tài liệu tham khảo.
- Các font chữ mặc định được thiết lập bao gồm: `Times New Roman` cho font chính, `Arial` cho font không chân, và `Consolas` cho mã nguồn (listings). Font toán học được sử dụng là `Latin Modern Math`.
- Nếu máy tính của bạn đã cài đặt font **STIX Two Math**, bạn có thể mở `uitcourseproject.cls` và thay đổi `\setmathfont{Latin Modern Math}` thành `\setmathfont{STIX Two Math}`.
- Với Windows, nếu dùng `latexmk`, hãy đảm bảo `perl` đã được cài đặt và cấu hình trong `PATH`.

