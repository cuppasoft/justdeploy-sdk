import asyncio

from justdeploy import AsyncJustDeploy


async def main() -> None:
    async with AsyncJustDeploy() as justdeploy, await justdeploy.storages.download("your-storage-id", "your-file-id") as download:
        async for chunk in download.aiter_bytes():
            print(f"received {len(chunk)} bytes")


asyncio.run(main())
