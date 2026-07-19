# PostgreSQL setup for the restaurant backend

## 1. Start PostgreSQL locally
If you already have PostgreSQL installed, create a database named `restaurant_db`.

Example with psql:

```bash
createdb restaurant_db
```

## 2. Configure the connection
The app uses this default connection string unless `DATABASE_URL` is set:

```bash
postgresql://postgres:postgres@localhost:5432/restaurant_db
```

You can override it when running the server:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/restaurant_db npm run start:server
```

## 3. Run the backend
```bash
npm run start:server
```

The server will initialize the required tables on first start.
