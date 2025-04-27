SoftUni React course project

 [# ComicWorld](https://comic-world-457306.web.app/)

'ComicWorld' is a single-page application based on the ReactJS library where users can find, buy and read their favorite comics. The app includes the following views and functionalities:

- `Home` view which is the main app view
- `Catalog` view where the user can find the catalog with comics
- `Details` view where the user can see every comic's details
- `Delete Comic` option where the Admin of the application can delete a comic
- `Rating` option where user can rate a comic
- `Buy Comic` option where user can buy a comic and add it to his/her personal My Comics view
- `Add Comment` option where the logged-in users can write a comment for a comic
- `Edit Comment` option where the logged-in users can edit a comment for a comic if he is the creator of the comment
- `Delete Comment` option where the logged-in users can delete a comment for a comic if he is the creator of the comment
- `My Comics` view where user can see all his/her possessed comics
- `Read Comic` view where user can read a comic that owns
- `Register` view where the user can make registration
- `Login` view where the user can log into his profile
- `Logout` option where the user can logout from his profile
- `About Us` view where all users can see a short presentation of the application

## App Details

The app is based on:

- ReactJS (v19.0.0)
-- React Dom (v19.0.0)
-- React Router: (v7.3.0)
-- React Toastify (v11.0.5)
- JavaScript
- HTML
- CSS
- RESTful API
- SoftUni Practice Server (as Database)
        

## Project Content

In the repository you will find two folders:

- `client` folder contains the app's front-end part
- `server` folder contains the app's back-end part

## How to Start/Stop the App

After downloading the application on your computer, you must first type `npm install` in your VS Code terminal to install `node_modules` folder. Then I suggest you to open two terminals in VS Code. Name the first one `client` and the other one `server` to distinguish them. In the `server` terminal, type `cd server` to enter the server folder, and then run the `node server.js` command to start the server. Then click on `client` terminal and type `cd client` command to enter the client folder. Then type `npm run dev` command to start the front-end part of the application. The following will appear in the `client` terminal:


```javascript
VITE v6.2.2 ready in 685 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

Click on `http://localhost:5173/` to open the app in your browser. After you finish working with the application, click on `client` terminal and press the `Ctrl+C` command to stop the front-end part of the application. Then click on the `server` terminal and press the same `Ctrl+C` command to stop the server.

## SoftUni Practice Server as Database

Please keep in mind that the database is based on SoftUni Practice Server created by [Viktor Kostadinov](https://github.com/viktorpts) and is not persistent. This means that you can register users, log in to your user profile, and buy and read comic recordings, but when you restart the server the data you made will be lost and the database will return to its initial state. If you want to know more about working with SoftUni Practice Server and its additional features you can [follow this link](https://github.com/softuni-practice-server/softuni-practice-server).

## Comic Record in the Database

Every comic record in the database has the following structure:

```javascript
comicsInfo: [
            {
                _ownerId:
                coverUrl:
                title:
                slogan:
                creators:
                info:
                currentPrice:
                oldPrice:
                createdAt:
                ratingId:
                _id:
                _createdOn:
            }
]
```

## RESTful API

For the app data, the following endpoints are supported:

- `GET /data/comicsInfo` - to get all the records from the database
- `GET /data/comicsInfo?where=_id IN(id1, id2,...idn)` - to get records selected by specific id's
- `GET /data/comicsInfo/:id` - to get a single record by id
- `GET /data/comicsInfo?sortBy=_createdOn desc?pageSize={n}` - to get n count of records sorted by creation date in descending order
- `DELETE /data/comicsInfo/:id` - to delete a record by id
- `GET /data/comicContent/:id?select=comicContent` - to get the content pages of a comic

For the comic rating, the following endpoints are supported:

- `GET /jsonstore/comic-rating/:ratingId` - to get a rating for a comic
- `PUT /jsonstore/comic-rating/:ratingId` - to update rating of a comic

For the user's owned comics the following endpoints are supported:

- `GET /data/myComics` - to get comics ids owned by user
- `POST data/myComics` - to create new record when user buy a comic

For the comments, the following endpoints are supported:

- `GET /data/comments` - to get all the comments for the current record
- `POST /data/comments` - to create a new comment
- `DELETE /data/comments/:id` - to delete a comment by id
- `PATCH /data/comments/:id` to edit a comment

For the user, the following endpoints are supported:

- `POST /users/register` - for user registration
- `POST /users/login` - for user login
- `GET /users/logout` - for user logout

## Premade Accounts

The app database comes with the following premade user accounts, which you may use for login:

```javascript
{
    "email": "peter@abv.bg",
    "password": "123456" 
}
```
```javascript
{
    "email": "george@abv.bg",
    "password": "123456" 
}
```
and
```javascript
{
    "email": "admin@abv.bg",
    "password": "admin" 
}
```