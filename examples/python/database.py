from justdeploy import JustDeploy

with JustDeploy() as justdeploy:
    justdeploy.databases.query("your-database-id", "SELECT * FROM orders WHERE customer = ?", params=["Ada"])
    print("query completed")
