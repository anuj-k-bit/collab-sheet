CollabSheet
A real-time collaborative spreadsheet web application with Google Sign-in, live presence indicators, and formula support.
🔗 Live Demo: collab-sheet-alpha.vercel.app

✨ Features

User Authentication — Sign in with Google or continue as a guest
Real-time Collaboration — See other users' cursors and edits live
Formula Support — Use formulas like =SUM(A1:A10), =A1+B1, and cell references
Spreadsheet Grid — 50 rows × 26 columns with keyboard navigation
Document Management — Create, rename, delete, and switch between multiple spreadsheets
Auto-save — Changes are saved automatically to local storage
Responsive Design — Works on desktop and mobile devices


🛠️ Tech Stack

Frontend: HTML5, CSS3, JavaScript (ES6+)
Styling: Custom CSS with CSS Variables
Deployment: Vercel
Storage: LocalStorage for data persistence

🚀 Getting Started
Run Locally

  1.Clone the repository
  git clone https://github.com/anuj-k-bit/collab-sheet.git
   cd collab-sheet

   2.Open public/index.html in your browser
   # Or use a local server
   npx serve public
   3.Visit http://localhost:3000

📁 Project Structure
collab-sheet/
├── public/
│   └── index.html    # Main application (single-file)
├── package.json
├── vercel.json       # Vercel deployment config
└── README.md

🎯 Roadmap

 Backend integration for real multi-user sync
 More formula functions (AVERAGE, COUNT, IF)
 Export to CSV/Excel
 Dark mode
 Cell formatting (bold, colors, borders)

 📄 License
MIT License — feel free to use this project for learning or building upon it.

👤 Author
Anuj Kekre

GitHub: @anuj-k-bit
Email: anujkekre04@gmail.com
   
