import "./globals.css";
import Nav from "./Nav";

export const metadata = {
  title: "DW Alliance Tracker",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="container">
          <Nav />
          {children}
        </div>
      </body>
    </html>
  );
}
