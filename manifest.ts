@import "tailwindcss";

:root {
  color-scheme: dark;
  --background: #070a12;
  --foreground: #eef2ff;
}

* {
  box-sizing: border-box;
}

html {
  min-width: 320px;
  background: var(--background);
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-height: 100vh;
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
}

button,
input,
select {
  font: inherit;
}

button {
  cursor: pointer;
}

select option {
  background: #0f172a;
  color: #f8fafc;
}

::selection {
  background: rgba(124, 58, 237, 0.45);
  color: white;
}

::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

::-webkit-scrollbar-track {
  background: #080b13;
}

::-webkit-scrollbar-thumb {
  border: 2px solid #080b13;
  border-radius: 999px;
  background: #273046;
}

::-webkit-scrollbar-thumb:hover {
  background: #3a4663;
}
