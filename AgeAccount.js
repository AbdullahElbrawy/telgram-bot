const data = require("./data.json"); // Import the JSON data

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
};

// function to get points based on the account creation date
const getPoints = (date) => {
  // example of date format: "Jan 2020" , "Feb 2020" or just "2020"
  let points = 0;
  let year = date.split(" ")[1];
  let month = date.split(" ")[0];
  for (const key in data) {
    if (key == year) {
      for (const key2 in data[key]) {
        if (key2 == month) {
          points = data[key][key2] * 2.5;
          return points;
        }
      }
    }
  }

  return points;
};

module.exports = {getPoints ,  getAccountCreationDate };
