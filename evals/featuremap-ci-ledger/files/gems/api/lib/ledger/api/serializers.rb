require "ledger/core/money"

module Ledger
  module Api
    module Serializers
      module_function

      def money(value)
        { "amount" => value.cents, "currency" => value.currency }
      end

      def account(account, balance)
        { "id" => account.id, "kind" => account.kind.to_s, "balance" => money(balance) }
      end
    end
  end
end
