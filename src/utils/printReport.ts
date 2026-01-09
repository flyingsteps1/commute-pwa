type PrintOptions = {
  title: string;
  html: string;
  extraCss?: string;
};

export function openPrintView({ title, html, extraCss }: PrintOptions) {
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) {
    window.print();
    alert("팝업이 차단되었습니다. 팝업을 허용한 뒤 다시 시도해 주세요.");
    return;
  }

  const styles = `
    :root { color-scheme: only light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
    }
    h1, h2 { margin: 0 0 8px; }
    .section { margin-top: 16px; }
    .summary {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-top: 12px;
    }
    .summaryItem {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 8px 10px;
      display: flex;
      justify-content: space-between;
      font-size: 12px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
      font-size: 12px;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 6px 8px;
      text-align: left;
    }
    th {
      background: #f3f4f6;
      font-weight: 700;
    }
    @media print {
      body { padding: 0; }
    }
    ${extraCss ?? ""}
  `;

  win.document.open();
  win.document.write(`<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>${styles}</style>
  </head>
  <body>
    ${html}
  </body>
</html>`);
  win.document.close();

  const onLoad = () => {
    win.focus();
    win.print();
    setTimeout(() => win.close(), 300);
  };

  if (win.document.readyState === "complete") {
    onLoad();
  } else {
    win.addEventListener("load", onLoad, { once: true });
  }
}
