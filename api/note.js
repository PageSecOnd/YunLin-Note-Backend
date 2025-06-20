let noteContent = "";

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ content: noteContent }));
  } else if (req.method === "POST") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try {
        const { content } = JSON.parse(body);
        noteContent = content;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Invalid body" }));
      }
    });
  } else {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method Not Allowed" }));
  }
};