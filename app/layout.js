import "./globals.css";

export const metadata = {
  title: "Next.js Chatbot Demo",
  description: "Reusable Next.js chatbot starter powered by Hugging Face Inference Providers"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
