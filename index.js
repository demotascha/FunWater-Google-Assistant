"use strict";

const functions = require("firebase-functions");
const algoliasearch = require("algoliasearch");
const gmaps = require("@google/maps");
const { dialogflow, Permission, Image, Button, BasicCard } = require("actions-on-google");

const app = dialogflow();

const client = algoliasearch(
  process.env.ALGOLIA_APP_ID,
  process.env.ALGOLIA_APP_KEY
);
const index = client.initIndex(process.env.ALGOLIA_APP_INDEX);
const googleMapsClient = gmaps.createClient({
  key: process.env.GOOGLE_API_KEY
});
const directionRoute = "https://www.google.com/maps/dir/?api=1&travelmode=walking";

app.intent("can_get_drinking_fountain", conv => {
  conv.data.requestedPermission = "DEVICE_PRECISE_LOCATION";
  return conv.ask(
    new Permission({
      context: "May I have your location?",
      permissions: conv.data.requestedPermission
    })
  );
});

app.intent("user_info", (conv, params, permissionGranted) => {
  if (permissionGranted) {
    const { requestedPermission } = conv.data;
    if (requestedPermission === "DEVICE_PRECISE_LOCATION") {
      const { coordinates } = conv.device.location;

      if (coordinates) {
        let lat = coordinates.latitude;
        let lng = coordinates.longitude;
        let user_latlng = `${lat},${lng}`;
        console.log("[UserInfo]: " + user_latlng);
        return new Promise(function (resolve, reject) {
          index
            .search({
              query: "",
              aroundLatLng: user_latlng,
              aroundRadius: 2000,
              hitsPerPage: 1
            })
            .then(res => {
              console.log("[Algolia][200]: " + JSON.stringify(res));
              if (res["hits"].length < 1) {
                conv.close(`Sorry, Taipei City only`);
                resolve();
              } else {
                let fountain = res["hits"][0];
                let fountain_latlng = `${fountain["_geoloc"]["lat"]},${
                  fountain["_geoloc"]["lng"]
                  }`;
                let display_name =
                  fountain["place_name_en"] + " " + fountain["place_en"];
                console.log("[FountainInfo]: " + fountain_latlng);

                googleMapsClient.distanceMatrix(
                  {
                    origins: user_latlng,
                    destinations: fountain_latlng,
                    mode: "walking",
                    language: "en-us"
                  },
                  function (err, response) {
                    if (!err) {
                      response.json.rows.map(function (destination) {
                        let distance = destination.elements[0].distance.text;
                        let duration = destination.elements[0].duration.text;
                        let result = `The closest drinking fountain is ${display_name}  \n`;
                        let info = `Distance: ${distance}  \nDuration: ${duration}  \n`;
                        console.log(result + info);
                        conv.ask(result + info);
                        let basicCard = new BasicCard({
                          text: `${info}  \nLatest update: ${
                            fountain["updated_time"]
                            }`,
                          subtitle: fountain["place_name_en"],
                          title: `${display_name}`,
                          buttons: new Button({
                            title: `Go to Google Map`,
                            url: `${directionRoute}&origin=${user_latlng}&destination=${fountain_latlng}`
                          }),
                          image: new Image({
                            url: process.env.IMAGE_URL,
                            alt: `${display_name}`
                          }),
                          display: "CROPPED"
                        });
                        console.log(basicCard);
                        conv.ask(basicCard);
                        conv.close("Thank you. See you next time.");
                        resolve();
                      });
                    }
                  }
                );
              }
            });
        });
      } else {
        return conv.close("Sorry, It's unavailable to get your location.");
      }
    }
  } else {
    return conv.close("Soory, Permission denied.");
  }
});

exports.dialogflowFirebaseFulfillment = functions.https.onRequest(app);
