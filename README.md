# ✈️ Trade Journal - Portfolio P&L Analytics

*(Scroll down for the English version)*

**📌 Note / หมายเหตุ:** ปัจจุบันตัวเว็บแอปพลิเคชันยังคงรองรับการแสดงผลเฉพาะ **ภาษาไทย** เท่านั้น

---

## 🇹🇭 ข้อมูลสรุปและคู่มือการใช้งาน (Thai)

แอปพลิเคชันเว็บแบบ Progressive Web Application (PWA) ที่เน้นความเป็นส่วนตัว ไร้ระบบหลังบ้าน (Zero-backend) ออกแบบมาเพื่อบันทึกการเทรดและวิเคราะห์กำไร/ขาดทุน (P&L) ด้วยมาตรฐานบัญชีแบบ FIFO รองรับ Bitcoin (BTC), ทองคำ และสินทรัพย์อื่น ๆ 

### 🌟 คุณสมบัติ (Features)
*   **Progressive Web App (PWA):** รองรับการติดตั้งเป็นแอปพลิเคชันบนสมาร์ทโฟน ใช้งานแบบออฟไลน์ได้
*   **Smart Market Data:** ดึงราคา BTC, ทองคำ และอัตราแลกเปลี่ยน USD/THB แบบเรียลไทม์ พร้อมระบบ Fallback หาก API มีปัญหา
*   **Interactive Analytics:** กราฟ Equity Curve และ Asset Allocation อัปเดตแบบเรียลไทม์ 
*   **Data Portability:** นำเข้าและส่งออกข้อมูล (Export/Import) ในรูปแบบ JSON และ CSV ได้อย่างอิสระ

### ⚙️ การทำงาน (How it works)
*   ประมวลผลลอจิกทั้งหมดฝั่งไคลเอนต์ (Client-side 100%)
*   คำนวณ Realized และ Unrealized P&L อัตโนมัติตามการจับคู่ต้นทุนแบบ First-In, First-Out (FIFO)
*   มีระบบดักจับการขายเกินจำนวนคงเหลือ (Short Sale) โดยคำนวณกำไรเฉพาะส่วนที่มีอยู่จริง เพื่อไม่ให้ตัวเลขพอร์ตโดยรวมบิดเบือน

### 💎 ข้อดี (Pros)
*   **Privacy 100%:** ข้อมูลทั้งหมดถูกเก็บไว้ในเครื่องของคุณผ่าน IndexedDB (localForage) ไม่มีการอัปโหลดขึ้นเซิร์ฟเวอร์ใด ๆ
*   **Infinite Storage:** รองรับการบันทึกรายการเทรดจำนวนมหาศาล (เช่น การ DCA ทุกวัน) โดยไม่ติดข้อจำกัด 5MB ของเบราว์เซอร์
*   **Smart Deduplication:** ระบบนำเข้าข้อมูลมีความฉลาดในการตรวจจับรายการที่ซ้ำกันผ่าน "ลายนิ้วมือของรายการเทรด" ป้องกันข้อมูลเพี้ยนจากการ Import ซ้ำซ้อน

### ⚠️ ข้อควรระวัง (Precautions)
*   เนื่องจากแอปพลิเคชันไม่มีฐานข้อมูลส่วนกลาง **การล้างแคช ล้างประวัติเบราว์เซอร์ (Clear site data) หรือล้างเครื่อง จะทำให้ข้อมูลการเทรดสูญหายอย่างถาวร**
*   ผู้ใช้ต้องหมั่นกด Export ข้อมูล (.json) เพื่อสำรองไฟล์เก็บไว้ในเครื่องหรือ Cloud ส่วนตัวอย่างสม่ำเสมอ

### 🚀 วิธีการใช้งาน (How to Use)
*   **ใช้งานผ่านเว็บ (Web-App):** เข้าใช้งานแอปพลิเคชันได้ที่ [https://chontit.github.io/trade-journal](https://chontit.github.io/trade-journal) และเริ่มบันทึกรายการได้ทันที
*   **ติดตั้งบนมือถือ (Add to Home Screen):**
    *   **iOS (Safari):** กดปุ่ม "Share" (สัญลักษณ์ลูกศรชี้ขึ้น) > เลือก "Add to Home Screen" (เพิ่มไปยังหน้าจอโฮม)
    *   **Android (Chrome):** กดไอคอนเมนู (จุด 3 จุดมุมขวาบน) > เลือก "Install App" หรือ "Add to Home Screen"

### 🔄 การโอนย้ายข้อมูลข้ามเครื่อง (Export & Import)
*   **การ Export:** ไปที่เมนูจัดการข้อมูลด้านล่างสุด กดปุ่ม **"Export ข้อมูล (.json)"** เพื่อดาวน์โหลดไฟล์ฐานข้อมูลปัจจุบันเก็บไว้
*   **การ Import ไปเครื่องใหม่:** เปิดแอปบนเครื่องใหม่ กด **"Import ข้อมูล"** และเลือกไฟล์ JSON ที่บันทึกไว้
*   **ระบบตรวจสอบรายการซ้ำ:** หากนำไฟล์เดิมมา Import ซ้ำ หรือกด Import ไปยังเครื่องที่มีข้อมูลบางส่วนอยู่แล้ว ระบบจะทำการ **Merge (รวมข้อมูล)** โดยข้ามรายการเทรดที่ซ้ำกันให้อัตโนมัติ ข้อมูลพอร์ตจะไม่เบิ้ลและไม่เพี้ยนแน่นอน

---

## 🇬🇧 Overview and User Guide (English)

**📌 Note:** Please note that the web application user interface currently supports the **Thai language** only.

A privacy-first, zero-backend Progressive Web Application (PWA) designed for tracking trades and analyzing Profit & Loss (P&L) using standard FIFO accounting methods. Optimized for Bitcoin (BTC), Gold, and customizable assets.

### 🌟 Features
*   **Progressive Web App (PWA):** Installable on smartphones for a native app-like experience with full offline capabilities.
*   **Smart Market Data:** Fetches real-time prices for BTC, Gold, and USD/THB FX conversion with robust API fallbacks.
*   **Interactive Analytics:** Real-time Equity Curve and Asset Allocation visualization.
*   **Data Portability:** Seamless Export and Import functionality in JSON and CSV formats.

### ⚙️ How it works
*   100% Client-side processing.
*   Automatically calculates Realized and Unrealized P&L based on First-In, First-Out (FIFO) inventory matching.
*   Gracefully handles unmatched short sales by calculating costs strictly based on available inventory, ensuring your total portfolio balance remains accurate.

### 💎 Pros
*   **100% Privacy:** All trade data is stored securely on your device using IndexedDB (localForage). No data is ever sent to an external server.
*   **Infinite Storage:** Capable of handling massive amounts of trade history (e.g., daily DCA) without hitting standard browser storage limits.
*   **Smart Deduplication:** The import engine intelligently detects duplicate trades via a "trade fingerprint," preventing double-counting and data corruption.

### ⚠️ Precautions
*   Because this application does not use a centralized backend database, **clearing your browser's site data/cookies or resetting your device will permanently delete your trade history.**
*   You must regularly use the "Export Data (.json)" feature to securely back up your records to a local drive or personal Cloud.

### 🚀 How to Use
*   **Standard Web-App:** Visit the live application at [https://chontit.github.io/trade-journal](https://chontit.github.io/trade-journal) and start recording your trades.
*   **Mobile App (Add to Home Screen):**
    *   **iOS (Safari):** Tap the "Share" button > Select "Add to Home Screen".
    *   **Android (Chrome):** Tap the menu icon (three dots) > Select "Install App" or "Add to Home Screen".

### 🔄 Database Migration (Export & Import across devices)
*   **To Export:** Navigate to the data tools at the bottom and click **"Export Data (.json)"** to download your entire database.
*   **To Import to a new device:** Open the app on your new device, click **"Import Data"**, and select your saved JSON file.
*   **Duplicate Protection:** If you import a file containing existing trades, the system will execute a smart **Merge**. It automatically detects and skips identical transaction fingerprints, ensuring your P&L data never duplicates or corrupts.

---
© 2026 Chollatis Bitcoiner. | Don't Trust, Verify.  
Powered by Claude AI | Don't Trust, Verify ⚡
