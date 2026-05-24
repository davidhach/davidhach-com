import Foundation

struct DashboardPayload: Decodable {
    let breakdown: Breakdown
    let snapshots: [Snapshot]
    let recentTransactions: [Transaction]
}

struct Breakdown: Decodable {
    let asOf: Date
    let currency: String
    let totalAssets: String
    let totalLiabilities: String
    let netWorth: String
    let byAssetClass: [String: String]
    let byEntity: [String: EntityValue]
    let assetCount: Int
    let liabilityCount: Int
}

struct EntityValue: Decodable {
    let name: String
    let value: String
}

struct Snapshot: Decodable, Identifiable {
    let id: String
    let date: Date
    let netWorth: String
    let totalAssets: String
    let totalLiabilities: String
}

struct Transaction: Decodable, Identifiable {
    let id: String
    let date: Date
    let amount: String
    let currency: String
    let description: String
    let merchant: String?
    let confidence: Double?
    let category: Category?
    let finAccount: FinAccountLite?
}

struct FinAccountLite: Decodable {
    let id: String
    let name: String
}

struct Category: Decodable {
    let id: String
    let name: String
}

struct StatementUpload: Decodable, Identifiable {
    let id: String
    let fileName: String
    let mimeType: String
    let byteSize: Int
    let status: String
    let uploadedAt: Date
    let parsedAt: Date?
}

struct ParseResponse: Decodable {
    let upload: StatementUpload
    let transactions: [Transaction]
}

struct SpendingPayload: Decodable {
    let currency: String
    let totalSpending: String
    let totalIncome: String
    let net: String
    let byCategory: [SpendingBucket]
    let byMerchant: [SpendingBucket]
    let byMonth: [MonthBucket]
}

struct SpendingBucket: Decodable, Identifiable {
    let name: String
    let total: String
    let count: Int
    var id: String { name }
}

struct MonthBucket: Decodable, Identifiable {
    let month: String
    let spending: String
    let income: String
    let net: String
    var id: String { month }
}

extension String {
    var asDecimal: Decimal { Decimal(string: self) ?? 0 }
    func formatted(currency: String, locale: Locale = .current) -> String {
        var loc = locale
        let fmt = NumberFormatter()
        fmt.numberStyle = .currency
        fmt.currencyCode = currency
        fmt.locale = loc
        return fmt.string(from: asDecimal as NSDecimalNumber) ?? self
    }
}
