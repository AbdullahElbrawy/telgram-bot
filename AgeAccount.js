const data = require('./data.json'); // Import the JSON data

//  6212076877 abdallah

// 947187152  zena

// 6212076877 abdallah
const getAccountCreationDate = (id) => {

  const value = id / 1000000;

  for (const year in data) {
    for (const month in data[year]) {
      if (value <= data[year][month]) {
        return `${month} ${year}`;
      }
    }
  }
  return "2024";
}


module.exports = {  getAccountCreationDate };
