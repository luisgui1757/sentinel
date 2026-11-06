require_relative "money"

module Ledger
  module Core
    class Account
      KINDS = %i[asset liability equity income expense].freeze

      attr_reader :id, :kind, :currency

      def initialize(id:, kind:, currency:)
        raise ArgumentError, "unknown kind #{kind}" unless KINDS.include?(kind)

        @id = id
        @kind = kind
        @currency = currency
      end

      def zero
        Money.new(0, currency)
      end
    end
  end
end
