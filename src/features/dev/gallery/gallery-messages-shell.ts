// Sample copy of the gallery sections for the foundation tokens and the window shell.
// Merged into `galleryMessages`.
export const shellGalleryMessages = {
  en: {
    foundations: {
      title: 'Foundations',
      neutrals: {
        title: 'Neutrals',
        lede: 'Cool greys with a slight blue bias. page is the main column, page-sheet the board ground and the area behind a sheet, surface-well the zebra rows, tiles and metric wells on screens, surface-1 the inputs and wells inside white cards.',
      },
      accent: {
        title: 'Accent',
        lede: 'Periwinkle: focus rings, chart lines, running progress and meters that are not a warning. Primary buttons stay ink.',
      },
      status: {
        title: 'Status triads',
        lede: 'A solid for dots, bars and icons, an ink for text and a soft for fills behind text.',
        sample: { ok: '6 of 6 checks passed', warn: 'Needs a look', crit: 'Critical' },
      },
      roles: {
        title: 'Chart roles',
        lede: 'One value per role: warn amber for bars, dots and growing tiles, lilac for a second line and its fill, one tint set for scan strips and the heatmap, and the treemap tiles.',
      },
      elevation: {
        title: 'Elevation',
        lede: 'No borders. Objects separate by tone first, then by a soft shadow tinted with the navy of ink. In dark the same shadows are black.',
      },
    },
    shell: {
      title: 'Window shell',
      lede: 'The left column at its three widths and the Settings column. Real components over a fixed report: three projects, five servers, one unreachable.',
      frames: 'Left column',
      spec: '248 from 1280 · 216 from 1080 · rail 64 below · minimum window 900 × 640',
      full: {
        name: 'Full sidebar, 248',
        spec: 'Rows 32 · a dot in the project colour, the count after the name in the severity ink · Settings pinned at the bottom.',
      },
      medium: {
        name: 'Sidebar, 216',
        spec: 'The same rows, narrower. 1080 to 1279.',
      },
      rail: {
        name: 'Rail, 64',
        spec: 'Project tiles 32 with a severity badge, one ring per server, the gear alone at the bottom. Hover names an item after 300 ms.',
      },
      settings: {
        name: 'Settings column, 248',
        spec: 'Values at the right of an item: language, theme.',
      },
      settingsNarrow: {
        name: 'Settings column, below 1080',
        spec: 'Keeps its 216 column and its labels; the values hide.',
      },
      marks: {
        title: 'Project mark',
        lede: 'A 32 px tile: the framework logo when setup found one, else a dot in the project colour. The badge carries the issue count in the severity colour; the open project gets a ring in its own colour.',
        spec: '32 · r10 · badge 14 · ring 2 + 1.5',
        issues: { name: 'Rail tile', spec: 'Critical, warning, healthy, no colour yet.' },
        active: {
          name: 'Open project',
          spec: 'A ring in the project colour; counts above 99 read 99+.',
        },
        well: {
          name: 'Project header',
          spec: 'The same tile on the well tone, inside a white card.',
        },
      },
      titlebar: {
        title: 'Title bar',
        lede: 'The title bar is an overlay: the window buttons sit in the first row of the sidebar. The top 40 px of the sidebar and of the page drag the window and a double click zooms it; buttons and fields inside that strip stay clickable. In full screen the buttons are gone and the sidebar keeps 18 px of top padding.',
        spec: 'buttons at x 16, y 18 · row 16 + gap 20 · drag strip 40 · full screen: top padding 18',
        strip: 'drag region, top 40 px',
      },
      tabs: {
        title: 'Project tab menu',
        lede: 'From 900 to 959 px the tabs fold into one button naming the open tab. The menu lists every tab with its status dot and its shortcut.',
        spec: 'rows 30 · r12 · 220 wide · 150 ms · ⌘1 to ⌘6',
      },
    },
  },
  vi: {
    foundations: {
      title: 'Nền tảng',
      neutrals: {
        title: 'Màu trung tính',
        lede: 'Xám lạnh hơi ngả xanh. page là cột chính, page-sheet là nền board và vùng sau sheet, surface-well là dòng kẻ sọc, ô và khung số liệu trên màn hình, surface-1 là ô nhập và khung trong thẻ trắng.',
      },
      accent: {
        title: 'Màu nhấn',
        lede: 'Xanh periwinkle: vòng focus, đường biểu đồ, tiến trình đang chạy và thanh đo không phải cảnh báo. Nút chính vẫn là màu mực.',
      },
      status: {
        title: 'Bộ ba trạng thái',
        lede: 'Solid cho chấm, thanh và biểu tượng, ink cho chữ, soft cho nền sau chữ.',
        sample: { ok: 'Đạt 6 trên 6 kiểm tra', warn: 'Cần xem lại', crit: 'Nghiêm trọng' },
      },
      roles: {
        title: 'Vai trò màu biểu đồ',
        lede: 'Mỗi vai trò một giá trị: hổ phách cảnh báo cho thanh, chấm và ô đang tăng, tím lilac cho đường thứ hai và vùng tô, một bộ màu chung cho dải quét và bản đồ nhiệt, cùng các ô treemap.',
      },
      elevation: {
        title: 'Độ nổi',
        lede: 'Không viền. Vật tách nhau trước hết bằng sắc độ, rồi bằng bóng mềm pha xanh navy của màu mực. Ở chế độ tối bóng là màu đen.',
      },
    },
    shell: {
      title: 'Khung cửa sổ',
      lede: 'Cột trái ở ba độ rộng và cột Cài đặt. Dùng thành phần thật với một báo cáo cố định: ba dự án, năm máy chủ, một máy không kết nối được.',
      frames: 'Cột trái',
      spec: '248 từ 1280 · 216 từ 1080 · thanh gọn 64 bên dưới · cửa sổ tối thiểu 900 × 640',
      full: {
        name: 'Thanh bên đầy đủ, 248',
        spec: 'Dòng 32 · chấm màu của dự án, số đếm sau tên theo màu mức độ · Cài đặt ghim ở đáy.',
      },
      medium: {
        name: 'Thanh bên, 216',
        spec: 'Cùng các dòng, hẹp hơn. Từ 1080 đến 1279.',
      },
      rail: {
        name: 'Thanh gọn, 64',
        spec: 'Ô dự án 32 kèm huy hiệu mức độ, mỗi máy chủ một vòng, chỉ còn bánh răng ở đáy. Rê chuột 300 ms thì hiện tên.',
      },
      settings: {
        name: 'Cột Cài đặt, 248',
        spec: 'Giá trị ở bên phải mục: ngôn ngữ, giao diện.',
      },
      settingsNarrow: {
        name: 'Cột Cài đặt, dưới 1080',
        spec: 'Giữ cột 216 và nhãn; các giá trị ẩn đi.',
      },
      marks: {
        title: 'Dấu dự án',
        lede: 'Ô 32 px: logo framework nếu bước thiết lập tìm thấy, không thì một chấm màu của dự án. Huy hiệu mang số vấn đề theo màu mức độ; dự án đang mở có vòng màu riêng.',
        spec: '32 · r10 · huy hiệu 14 · vòng 2 + 1.5',
        issues: { name: 'Ô trên thanh gọn', spec: 'Nghiêm trọng, cảnh báo, ổn, chưa có màu.' },
        active: { name: 'Dự án đang mở', spec: 'Vòng màu của dự án; trên 99 hiện 99+.' },
        well: { name: 'Đầu trang dự án', spec: 'Cùng ô đó trên nền well, trong thẻ trắng.' },
      },
      titlebar: {
        title: 'Thanh tiêu đề',
        lede: 'Thanh tiêu đề là lớp phủ: ba nút cửa sổ nằm ở hàng đầu của sidebar. 40 px trên cùng của sidebar và của trang kéo được cửa sổ, bấm đúp để phóng to; nút và ô nhập trong dải đó vẫn bấm được. Ở chế độ toàn màn hình nút biến mất và sidebar giữ padding trên 18 px.',
        spec: 'nút ở x 16, y 18 · hàng 16 + khoảng cách 20 · dải kéo 40 · toàn màn hình: padding trên 18',
        strip: 'vùng kéo, 40 px trên cùng',
      },
      tabs: {
        title: 'Menu tab dự án',
        lede: 'Từ 900 đến 959 px các tab gập thành một nút ghi tên tab đang mở. Menu liệt kê mọi tab kèm chấm trạng thái và phím tắt.',
        spec: 'dòng 30 · r12 · rộng 220 · 150 ms · ⌘1 đến ⌘6',
      },
    },
  },
}
