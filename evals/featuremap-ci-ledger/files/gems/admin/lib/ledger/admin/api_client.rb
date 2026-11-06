require "json"

module Ledger
  module Admin
    class ApiClient
      def initialize(transport)
        @transport = transport
      end

      def accounts(cursor: 0)
        JSON.parse(@transport.call("GET", "/api/v1/accounts?cursor=#{cursor}"))
      end
    end
  end
end
