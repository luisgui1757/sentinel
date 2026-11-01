require_relative '../db/models/order_store'

OrderStore.delete_older_than(days: 90)
