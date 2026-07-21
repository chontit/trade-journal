# ✈️ Trade Journal - Portfolio P&L Analytics

*(Scroll down for English version)*

แอปพลิเคชันเว็บแบบ Progressive Web Application (PWA) ที่เน้นความเป็นส่วนตัว ไร้ระบบหลังบ้าน (Zero-backend) ออกแบบมาเพื่อบันทึกการเทรดและวิเคราะห์กำไร/ขาดทุน (P&L) ด้วยมาตรฐานบัญชีแบบ FIFO (First-In, First-Out) รองรับ Bitcoin (BTC), ทองคำ และสินทรัพย์อื่น ๆ อย่างสมบูรณ์แบบ

## 🌟 ฟีเจอร์หลัก (Key Features)

*   **Zero-Backend & Privacy-First:** ประมวลผลฝั่งไคลเอนต์ 100% ข้อมูลการเทรดทั้งหมดจะถูกเก็บไว้อย่างปลอดภัยบนเครื่องของคุณผ่าน IndexedDB (localForage) โดยไม่มีการส่งข้อมูลไปยังเซิร์ฟเวอร์ภายนอก 
*   **Progressive Web App (PWA):** สามารถติดตั้งบนอุปกรณ์ iOS และ Android เพื่อประสบการณ์ใช้งานแบบแอปพลิเคชันแท้ ๆ และรองรับการทำงานแบบออฟไลน์ได้อย่างสมบูรณ์
*   **FIFO Accounting Engine:** คำนวณ Realized และ Unrealized P&L อัตโนมัติตามการจับคู่ต้นทุนแบบ First-In, First-Out พร้อมระบบแจ้งเตือนกรณีบันทึกขายเกินจำนวนคงเหลือ
*   **Dynamic Market Data:** ดึงราคา BTC และทองคำแบบเรียลไทม์ พร้อมแปลงสกุลเงิน USD เป็น THB อัตโนมัติผ่านการเชื่อมโยงข้อมูลอัตราแลกเปลี่ยน (พร้อมระบบ Fallback API)
*   **Interactive Visualization:** แสดงผลกราฟ Equity Curve และสัดส่วนสินทรัพย์ (Asset Allocation) แบบเรียลไทม์ด้วย Chart.js ที่รองรับการสัมผัสบนมือถือ
*   **Data Portability:** รองรับการ Export/Import ข้อมูลในรูปแบบ JSON และ CSV เพื่อให้คุณเป็นเจ้าของข้อมูลอย่างแท้จริง

## 🛠️ เทคโนโลยีที่ใช้ (Technology Stack)

*   **HTML5 / CSS3 (CSS Variables):** รองรับระบบธีม Dark / Light อย่างสวยงาม
*   **Vanilla JavaScript (ES6+):** จัดการลอจิกและ DOM ทั้งหมดโดยไม่พึ่งพาเฟรมเวิร์กที่หนักเกินความจำเป็น
*   **localForage:** ฐานข้อมูลระดับไคลเอนต์ (IndexedDB) แบบ Asynchronous รองรับข้อมูลขนาดมหาศาลโดยไม่ทำให้เบราว์เซอร์ค้าง
*   **Chart.js:** กราฟิกแสดงผลข้อมูลทางการเงินที่ปรับตัวตามหน้าจอได้ (Responsive)
*   **Service Worker:** ระบบจัดการแคชอัจฉริยะสำหรับการใช้งานแบบออฟไลน์ (Offline-first architecture)

## 🚀 การเริ่มต้นใช้งาน (Getting Started)

เนื่องจากเป็นแอปพลิเคชันฝั่งไคลเอนต์ คุณสามารถเริ่มต้นใช้งานได้ทันทีโดยไม่ต้องติดตั้งเซิร์ฟเวอร์:

1.  เข้าใช้งานแอปพลิเคชันได้ที่: `[ใส่ลิงก์ GitHub Pages ของคุณที่นี่ เช่น https://username.github.io/trade-journal/ ]`
2.  **สำหรับมือถือ:** กด "Share" > "Add to Home Screen" (iOS) หรือเปิดเมนูเบราว์เซอร์แล้วเลือก "Install App" (Android) เพื่อใช้เป็นแอปแบบ Standalone
3.  เริ่มต้นบันทึกรายการเทรดของคุณ! ข้อมูลจะถูกบันทึกลงในอุปกรณ์ของคุณทันที

## ⚠️ คำเตือนเรื่องความปลอดภัยของข้อมูล (Data Safety Disclaimer)

เนื่องจากการทำงานของระบบนี้ไม่มีฐานข้อมูลหลังบ้าน **การล้างแคชและข้อมูลเว็บไซต์ของเบราว์เซอร์ (Clearing site data) หรือการล้างเครื่อง จะทำให้ประวัติการเทรดของคุณหายไปอย่างถาวร**
*กรุณาใช้งานฟีเจอร์ "Export ข้อมูล (.json)" เพื่อสำรองข้อมูลของคุณไว้ในเครื่องหรือบน Cloud อย่างสม่ำเสมอ*

## 📄 License

โปรเจกต์นี้เปิดให้ใช้งานสำหรับการใช้งานส่วนบุคคล *Don't Trust, Verify.*

---

# ✈️ Trade Journal - Portfolio P&L Analytics (English)

A privacy-first, zero-backend Progressive Web Application (PWA) designed for tracking trades and analyzing Profit & Loss (P&L) using standard FIFO (First-In, First-Out) accounting methods. Optimized for Bitcoin (BTC), Gold, and customizable assets.

## 🌟 Key Features

*   **Zero-Backend & Privacy-First:** 100% Client-side processing. All trade data is stored securely on your device using IndexedDB (via localForage). No data is ever sent to an external server.
*   **Progressive Web App (PWA):** Installable on iOS and Android devices for a native app-like experience with full offline capabilities.
*   **FIFO Accounting Engine:** Automatically calculates Realized and Unrealized P&L based on First-In, First-Out inventory matching. Handles partial matches and unmatched short sales gracefully.
*   **Dynamic Market Data:** Fetches real-time prices for BTC and Gold, including automated USD to THB FX conversion with multiple API fallbacks.
*   **Interactive Visualization:** Real-time Equity Curve and Asset Allocation doughnut charts powered by Chart.js.
*   **Data Portability:** Easy Export/Import functionality for JSON and CSV formats to ensure you never lose your data.

## 🛠️ Technology Stack

*   **HTML5 / CSS3 (CSS Variables):** Custom dark/light mode UI.
*   **Vanilla JavaScript (ES6+):** Core application logic and DOM manipulation without heavy frameworks.
*   **localForage:** Asynchronous storage wrapping IndexedDB for unlimited, non-blocking data storage.
*   **Chart.js:** Responsive and touch-friendly data visualization.
*   **Service Worker:** Intelligent caching strategy (Network-first, Cache-first, Stale-while-revalidate) for offline access.

## 🚀 Getting Started

Since this is a client-side application, you can use it immediately without any installation or server setup.

1.  Visit the live application: `[Insert your GitHub Pages URL here]`
2.  **Mobile Users:** Tap "Share" > "Add to Home Screen" (iOS) or select "Install App" from the browser menu (Android) to use it as a standalone app.
3.  Start recording your trades. Your data will persist locally on your browser.

## ⚠️ Data Safety Disclaimer

Because this application does not use a backend database, **clearing your browser's site data/cookies will delete your trade history permanently.** 
*Please make sure to regularly use the "Export JSON" feature to back up your records securely.*

## 📄 License

This project is open-source and available for personal use. *Don't Trust, Verify.*
