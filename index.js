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

app.intent("CanGetWater", conv => {
  conv.data.requestedPermission = "DEVICE_PRECISE_LOCATION";
  return conv.ask(
    new Permission({
      context: "要抓取您的位置",
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
        return new Promise(function(resolve, reject) {
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
                conv.close(`對不起，目前不支援此地點`);
                resolve();
              } else {
                let fountain = res["hits"][0];
                let fountain_latlng = `${fountain["_geoloc"]["lat"]},${
                  fountain["_geoloc"]["lng"]
                }`;
                let display_name =
                  fountain["place_name"] + " " + fountain["place"];
                console.log("[FountainInfo]: " + fountain_latlng);

                googleMapsClient.distanceMatrix(
                  {
                    origins: user_latlng,
                    destinations: fountain_latlng,
                    mode: "walking",
                    language: "zh-tw"
                  },
                  function(err, response) {
                    if (!err) {
                      response.json.rows.map(function(destination) {
                        let distance = destination.elements[0].distance.text;
                        let duration = destination.elements[0].duration.text;
                        let result = `離你最近的飲水機是在 ${display_name}  \n`;
                        let info = `距離: ${distance}  \n步行時間: ${duration}  \n`;
                        console.log(result + info);
                        conv.ask(result + info);
                        let basicCard = new BasicCard({
                          text: `${info}  \n資料最後更新時間: ${
                            fountain["updated_time"]
                          }`,
                          subtitle: fountain["place_name"],
                          title: `${display_name}`,
                          buttons: new Button({
                            title: `點我到 Google Map`,
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
                        conv.close("謝謝，希望下次能再次為您服務");
                        resolve();
                      });
                    }
                  }
                );
              }
            });
        });
      } else {
        return conv.close("對不起，目前 GPS 沒辦法定位");
      }
    }
  } else {
    return conv.close("對不起，授權失敗。請重新呼叫，然後再次授權");
  }
});

exports.dialogflowFirebaseFulfillment = functions.https.onRequest(app);
