import os
os.environ["JWT_SECRET"] = "test-secret-32-characters-minimum-ok!!"
os.environ["USERS_URL"] = "http://localhost:9991"
os.environ["PRODUCTS_URL"] = "http://localhost:9992"
os.environ["PRODUCTS_REPLICA_URL"] = "http://localhost:9993"
os.environ["ORDERS_URL"] = "http://localhost:9994"
