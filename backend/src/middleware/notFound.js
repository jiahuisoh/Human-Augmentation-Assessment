// Terminal middleware: any request that fell through every route is a 404.
const notFound = (req, res) => {
  res.status(404).json({ error: "Route not found" });
};

module.exports = notFound;
