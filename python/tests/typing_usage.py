from justdeploy import AsyncJustDeploy, JustDeploy, Mail, QueryResult, StoredFile


def use_sync(client: JustDeploy, database_id: str, storage_id: str) -> None:
    result: QueryResult = client.databases.query(database_id, "SELECT * FROM orders")
    client.databases.query(database_id, "SELECT * FROM orders WHERE id = ?", params=["order-1"])
    file: StoredFile = client.storages.upload(storage_id, name="hello.txt", mime="text/plain", data=b"hello")
    client.storages.create_upload_url(storage_id, name="hello.txt", mime="text/plain")
    mail: Mail = client.mail.send(
        sender="hello@example.com",
        to="user@example.net",
        subject="Hello",
        text="Hi",
    )
    _ = (result, file, mail)


async def use_async(client: AsyncJustDeploy, database_id: str, storage_id: str) -> None:
    result: QueryResult = await client.databases.query(database_id, "SELECT * FROM orders")
    await client.databases.query(database_id, "SELECT * FROM orders WHERE id = ?", params=("order-1",))
    file: StoredFile = await client.storages.upload(storage_id, name="hello.txt", mime="text/plain", data=b"hello")
    await client.storages.create_upload_url(storage_id, name="hello.txt", mime="text/plain")
    mail: Mail = await client.mail.send(
        sender="hello@example.com",
        to="user@example.net",
        subject="Hello",
        text="Hi",
    )
    _ = (result, file, mail)
