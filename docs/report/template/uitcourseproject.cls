\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{uitcourseproject}[2026/03/27 UIT course project template]

\DeclareOption*{\PassOptionsToClass{\CurrentOption}{report}}
\ProcessOptions\relax
\LoadClass[11pt,a4paper,oneside]{report}

\RequirePackage[utf8]{inputenc}
\RequirePackage[T5]{fontenc}
\RequirePackage[english,vietnamese]{babel}
\renewcommand{\rmdefault}{ptm}
\RequirePackage{newtxmath}
\RequirePackage{geometry}
\RequirePackage{graphicx}
\RequirePackage{xcolor}
\RequirePackage{tikz}
\RequirePackage{setspace}
\RequirePackage{microtype}
\RequirePackage{indentfirst}
\RequirePackage{enumitem}
\RequirePackage{booktabs}
\RequirePackage{array}
\RequirePackage{longtable}
\RequirePackage{tabularx}
\RequirePackage{amsmath}
\RequirePackage{mathtools}
\RequirePackage{float}
\RequirePackage{pdflscape}
\RequirePackage{chngcntr}
\RequirePackage{titlesec}
\RequirePackage{tocloft}
\RequirePackage{caption}
\RequirePackage{subcaption}
\RequirePackage{fancyhdr}
\RequirePackage[unicode]{hyperref}
\RequirePackage{bookmark}
\RequirePackage{csquotes}
\RequirePackage{etoolbox}

\definecolor{uitblue}{HTML}{2F6BFF}
\definecolor{uitborder}{HTML}{2451C0}
\newcolumntype{Y}{>{\raggedright\arraybackslash}X}
\usetikzlibrary{calc}

\geometry{
  a4paper,
  top=2.54cm,
  bottom=2.54cm,
  left=2.54cm,
  right=2.54cm,
  headheight=18pt,
  includeheadfoot=true
}

\makeatletter
\renewcommand\normalsize{%
  \@setfontsize\normalsize{13pt}{18pt}%
  \abovedisplayskip 12pt plus 3pt minus 7pt%
  \abovedisplayshortskip \z@ plus 3pt%
  \belowdisplayshortskip 7pt plus 3pt minus 4pt%
  \belowdisplayskip \abovedisplayskip
  \let\@listi\@listI
}
\renewcommand\small{%
  \@setfontsize\small{12pt}{16pt}%
  \abovedisplayskip 10pt plus 2pt minus 5pt%
  \abovedisplayshortskip \z@ plus 2pt%
  \belowdisplayshortskip 6pt plus 2pt minus 3pt%
  \def\@listi{\leftmargin\leftmargini
              \topsep 6pt plus 2pt minus 2pt
              \parsep 3pt plus 1pt minus 1pt
              \itemsep \parsep}%
  \belowdisplayskip \abovedisplayskip
}
\makeatother
\normalsize

\graphicspath{{figures/}}
\setstretch{1.15}
\setlength{\parindent}{1.27cm}
\setlength{\parskip}{0pt}
\setlength{\arrayrulewidth}{0.6pt}
\renewcommand{\arraystretch}{1.15}
\setlist[itemize]{leftmargin=2em}
\setlist[enumerate]{leftmargin=2em}

\hypersetup{
  colorlinks=true,
  linkcolor=black,
  citecolor=black,
  urlcolor=uitblue,
  pdfstartview=FitH
}

\captionsetup{
  font={normalsize,it},
  labelfont=it,
  textfont=it,
  justification=centering,
  singlelinecheck=false
}

\addto\captionsvietnamese{%
  \renewcommand{\contentsname}{MỤC LỤC}%
  \renewcommand{\listfigurename}{DANH SÁCH HÌNH}%
  \renewcommand{\listtablename}{DANH SÁCH BẢNG}%
}
\addto\captionsenglish{%
  \renewcommand{\contentsname}{MỤC LỤC}%
  \renewcommand{\listfigurename}{DANH SÁCH HÌNH}%
  \renewcommand{\listtablename}{DANH SÁCH BẢNG}%
}
\renewcommand{\cftdotsep}{1.5}
\renewcommand{\cftchapleader}{\cftdotfill{\cftdotsep}}
\renewcommand{\cftsecleader}{\cftdotfill{\cftdotsep}}
\renewcommand{\cftsubsecleader}{\cftdotfill{\cftdotsep}}
\renewcommand{\cftchapaftersnum}{.}
\renewcommand{\cftsecaftersnum}{.}
\renewcommand{\cftsubsecaftersnum}{.}
\setlength{\cftchapnumwidth}{1.4em}
\setlength{\cftsecnumwidth}{1.4em}
\setlength{\cftsubsecnumwidth}{2.7em}

\setcounter{secnumdepth}{3}
\setcounter{tocdepth}{2}
\counterwithout{figure}{chapter}
\counterwithout{table}{chapter}

\renewcommand{\thesection}{\arabic{section}}
\renewcommand{\thesubsection}{\thesection.\arabic{subsection}}
\renewcommand{\thesubsubsection}{\thesubsection.\arabic{subsubsection}}

\titleformat{\chapter}[block]
  {\normalfont\bfseries\fontsize{16pt}{20pt}\selectfont\filcenter}
  {\MakeUppercase{Chương \Roman{chapter}.}}
  {0.5em}
  {\MakeUppercase}
\titleformat{name=\chapter,numberless}[block]
  {\normalfont\bfseries\fontsize{16pt}{20pt}\selectfont\filcenter}
  {}
  {0pt}
  {\MakeUppercase}

\titlespacing*{\chapter}{0pt}{0pt}{24pt}
\titleformat{\section}
  {\normalfont\bfseries\fontsize{15pt}{18pt}\selectfont}
  {\thesection.}
  {0.5em}
  {}
\titleformat{\subsection}
  {\normalfont\bfseries\fontsize{15pt}{18pt}\selectfont}
  {\thesubsection.}
  {0.5em}
  {}
\titleformat{\subsubsection}
  {\normalfont\bfseries\fontsize{15pt}{18pt}\selectfont}
  {\thesubsubsection.}
  {0.5em}
  {}

\titlespacing*{\section}{0pt}{18pt}{8pt}
\titlespacing*{\subsection}{0pt}{14pt}{6pt}
\titlespacing*{\subsubsection}{0pt}{12pt}{4pt}

\pagestyle{fancy}
\fancyhf{}
\fancyfoot[C]{\thepage}
\renewcommand{\headrulewidth}{0.4pt}
\renewcommand{\footrulewidth}{0pt}
\makeatletter
\let\ps@plain\ps@fancy

\newcommand{\@university}{TRƯỜNG ĐẠI HỌC CÔNG NGHỆ THÔNG TIN, ĐHQG-HCM}
\newcommand{\university}[1]{\renewcommand{\@university}{#1}}
\newcommand{\@faculty}{KHOA MẠNG MÁY TÍNH VÀ TRUYỀN THÔNG}
\newcommand{\faculty}[1]{\renewcommand{\@faculty}{#1}}
\newcommand{\@reporttype}{BÁO CÁO ĐỒ ÁN MÔN HỌC}
\newcommand{\reporttype}[1]{\renewcommand{\@reporttype}{#1}}
\newcommand{\@reporttitle}{TÊN ĐỀ TÀI}
\newcommand{\reporttitle}[1]{\renewcommand{\@reporttitle}{#1}}
\newcommand{\@coursecode}{SE000}
\newcommand{\coursecode}[1]{\renewcommand{\@coursecode}{#1}}
\newcommand{\@coursename}{Tên môn học}
\newcommand{\coursename}[1]{\renewcommand{\@coursename}{#1}}
\newcommand{\@supervisor}{Tên giảng viên}
\newcommand{\supervisor}[1]{\renewcommand{\@supervisor}{#1}}
\newcommand{\@groupnumber}{00}
\newcommand{\groupnumber}[1]{\renewcommand{\@groupnumber}{#1}}
\newcommand{\@projectduration}{01/2026 - 03/2026}
\newcommand{\projectduration}[1]{\renewcommand{\@projectduration}{#1}}
\newcommand{\@reportplace}{TP. Hồ Chí Minh}
\newcommand{\reportplace}[1]{\renewcommand{\@reportplace}{#1}}
\newcommand{\@reportyear}{2026}
\newcommand{\reportyear}[1]{\renewcommand{\@reportyear}{#1}}
\newcommand{\@coverlogo}{figures/uit-logo.png}
\newcommand{\coverlogo}[1]{\renewcommand{\@coverlogo}{#1}}
\newcommand{\@reportmembers}{Sinh viên A & 22520001 & Trưởng nhóm \\}
\newcommand{\reportmembers}[1]{\renewcommand{\@reportmembers}{#1}}

\newcommand{\makecoverpage}{%
  \begin{titlepage}
    \newgeometry{top=1.2cm,bottom=2.54cm,left=2.54cm,right=2.54cm}
    \thispagestyle{empty}
    \begin{tikzpicture}[remember picture,overlay]
      \draw[uitborder, line width=4.0pt]
        ($(current page.north west)+(0.72cm,-0.72cm)$)
        rectangle
        ($(current page.south east)+(-0.72cm,0.72cm)$);
      \draw[uitborder, line width=2.0pt]
        ($(current page.north west)+(0.95cm,-0.95cm)$)
        rectangle
        ($(current page.south east)+(-0.95cm,0.95cm)$);
    \end{tikzpicture}

    \begin{center}
      \vspace*{1.7cm}
      {\bfseries\normalsize \MakeUppercase{\@university} \par}
      \vspace{0.38cm}
      {\bfseries\fontsize{15pt}{18pt}\selectfont \MakeUppercase{\@faculty} \par}
      \vspace{1.05cm}
      \IfFileExists{\@coverlogo}{%
        \includegraphics[width=4.2cm]{\@coverlogo}\par
        \vspace{1.05cm}
      }{%
        \vspace{3.1cm}
      }
      {\bfseries\fontsize{16pt}{18pt}\selectfont \MakeUppercase{\@reporttype} \par}
      \vspace{0.82cm}
      {\bfseries\fontsize{15pt}{18pt}\selectfont ĐỀ TÀI:\par}
      \vspace{0.38cm}
      {\bfseries\fontsize{15pt}{18pt}\selectfont
        \begin{minipage}{0.78\textwidth}
          \centering
          \MakeUppercase{\@reporttitle}
        \end{minipage}\par
      }
    \end{center}

    \vspace{2.4cm}
    \begin{minipage}{0.88\textwidth}
      \normalsize
      \noindent\textbf{Môn học:} \@coursecode{} -- \@coursename\par
      \vspace{0.35cm}
      \noindent\textbf{Giảng viên hướng dẫn:} \@supervisor\par
      \vspace{0.35cm}
      \noindent\textbf{Thực hiện bởi nhóm:}\par
      \vspace{0.15cm}
      \hspace*{1.2em}%
      \begin{tabularx}{0.92\textwidth}{@{}Y l Y@{}}
        \@reportmembers
      \end{tabularx}\par
      \vspace{0.35cm}
      \noindent\textbf{Thời gian thực hiện:} \@projectduration\par
    \end{minipage}

    \vspace{0.15cm}
    \vfill
    \begin{center}
      \@reportplace{}, \@reportyear
    \end{center}
  \end{titlepage}
}

\newcommand{\setupmainmatter}{%
  \clearpage
  \pagenumbering{arabic}
  \setcounter{page}{2}
  \pagestyle{fancy}
  \fancyhf{}
  \fancyhead[L]{\color{black!80}Báo cáo Đồ án \@coursename}
  \fancyhead[R]{\color{black!80}Nhóm \@groupnumber}
  \fancyfoot[C]{\color{black!80}\thepage}
}

\newcommand{\preliminarychapter}[1]{%
  \chapter*{#1}
  \addcontentsline{toc}{chapter}{#1}
}
\makeatother
