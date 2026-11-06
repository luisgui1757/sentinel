module Ledger
  module Core
    Money = Struct.new(:cents, :currency) do
      def +(other)
        raise ArgumentError, "currency mismatch" unless currency == other.currency

        Money.new(cents + other.cents, currency)
      end

      def to_s
        format("%.2f %s", cents / 100.0, currency)
      end
    end
  end
end
