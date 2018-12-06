const cors = require('cors')({origin: true});
const sanitizeHtml = require('sanitize-html');
// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require('firebase-functions');

// The Firebase Admin SDK to access the Firebase Realtime Database.
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

// The express app used for routing
const app = require('express')();

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

// List all the posts under the path /posts, and an individual post under /posts/ID
app.get(['/', '/:id'], functions.https.onRequest((req, res) => {

  const postid = req.params.id;
  let reference = 'posts';
  reference += postid ? '/' + postid : '';

  cors(req, res, () => {
    return admin.database().ref(reference).once('value').then(function(snapshot) {
      if (snapshot.val() !== null) {
        res.status(200).send(JSON.stringify(snapshot));
      } else {
        res.status(200).send({});
      }
    });
  });
}));

// create a new post
// create a new post
app.post(
  "/",
  functions.https.onRequest((req, res) => {
    cors(req, res, () => {
      let content = req.body.content ? sanitizeHtml(req.body.content, { allowedTags: [], allowedAttributes: [] }) : null;
      if (content === null) {
        res.status(200).send({ error: "Missing content" });
        return;
      }
      // we have something TO post, confirm we are ALLOWED to post
      const tokenId = req.body.token;
      admin
        .auth()
        .verifyIdToken(tokenId)
        .then(function(decodedUser) {
        	console.log(decodedUser);
        	if (decodedUser.uid === '****************') {
          // title can be provided, or extracted from the content
          let title = req.body.title ? sanitizeHtml(req.body.title, { allowedTags: [], allowedAttributes: [] }) : content.substr(0, 20) + '...';
          // we want the server to set the time, so use firebase timestamp
          let postDate = admin.database.ServerValue.TIMESTAMP;
          /*
     * @see [https://firebase.google.com/docs/auth/admin/verify-id-tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens) 
     * decoded User fields: aud, auth_time, email, email_verified, exp, iat, iss, name, picture, sub, uid, user_id */
          // For the first pass, use user's Name. This isn't unique
          let postAuthor = decodedUser.name;

          // assembled data
          let postData = {
            author: postAuthor,
            title: title,
            content: content,
            created: postDate
          };

          // create a new ID with empty values
          let postKey = admin
            .database()
            .ref("posts")
            .push().key;

          // set() will overwrite all values in the entry
          admin
            .database()
            .ref("/posts")
            .child(postKey)
            .set(postData, function() {
              // Read the saved data back out
              return admin
                .database()
                .ref("/posts/" + postKey)
                .once("value")
                .then(function(snapshot) {
                  if (snapshot.val() !== null) {
                    let postJSON = snapshot.val();
                    postJSON.id = postKey;
                    res.status(200).send(JSON.stringify(postJSON));
                  } else {
                    res.status(200).send({ error: "Unable to save post" });
                  }
                });
            });
        }
        })
        .catch(err => res.status(401).send(err));
    });
  })
);

// This works for posts/ and posts/101, but not for /posts
// exports.posts = functions.https.onRequest(app);
// @see https://gist.github.com/cdock1029/9f3a58f352663ea90f8b9675412c4aea

exports.posts = functions.https.onRequest((req, res) => {
  // Handle routing of /posts without a trailing /,
  if (!req.path) {
    // prepending "/" keeps query params, path params intact
    req.url = `/${req.url}`;
  }
  return app(req, res);
});