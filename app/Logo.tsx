// Логотип Loopin: чорна версія на світлій темі, біла — на темній (prefers-color-scheme,
// як і решта застосунку). SVG-файли мають великі поля навколо знака (полотно 1328x800),
// тому обрізання до самого знака робить CSS (.logo в app/globals.css), а не правка файлів.
export default function Logo({ width = 168 }: { width?: number }) {
  return <span role="img" aria-label="Loopin" className="logo" style={{ width }} />;
}
