require("dotenv").config();
const app = require("./app");

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
// Deployment trigger - Fri Aug 21 16:50:19 IST 2026
