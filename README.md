# Exa Ranking Lab

A comprehensive developer tool for analyzing and tracking Exa's search ranking performance. Built with Next.js 15, TypeScript, and Tailwind CSS.

## 🚀 Features

### Core Functionality
- **Query Builder**: Create and manage search queries with advanced filtering
- **Real-time Monitoring**: Execute queries and monitor performance in real-time
- **Ranking Analysis**: Track ranking changes and performance metrics
- **Snapshot Management**: Capture and store search result snapshots
- **Comparison Tools**: Compare rankings between different time periods
- **Feedback System**: Annotate and rate search result quality
- **Analytics Dashboard**: Comprehensive insights and performance metrics

### Technical Features
- **Real Exa API Integration**: Direct integration with Exa's search API
- **Responsive Design**: Mobile-first design with Tailwind CSS
- **Type Safety**: Full TypeScript implementation
- **Real-time Updates**: Live query execution monitoring
- **Data Persistence**: Local storage with export/import capabilities
- **Modern UI**: Clean, professional interface with shadcn/ui components

## 🛠 Technology Stack

### Frontend
- **Next.js 15**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first CSS framework
- **shadcn/ui**: Modern UI component library
- **Recharts**: Data visualization and charts
- **React Hook Form**: Form handling with validation
- **Zod**: Schema validation

### Backend
- **Next.js API Routes**: Server-side API endpoints
- **Exa API**: Search and content discovery
- **Local Storage**: Client-side data persistence

### Development Tools
- **ESLint**: Code linting
- **Prettier**: Code formatting
- **TypeScript**: Static type checking

## 📋 Prerequisites

- Node.js 18+ 
- npm or yarn
- Exa API key (get one at [exa.ai](https://exa.ai))

## 🚀 Quick Start

### 1. Clone the Repository
\`\`\`bash
git clone https://github.com/your-username/exa-ranking-lab.git
cd exa-ranking-lab
\`\`\`

### 2. Install Dependencies
\`\`\`bash
npm install
# or
yarn install
\`\`\`

### 3. Environment Setup
Create a `.env.local` file in the root directory:
\`\`\`env
EXA_API_KEY=your_exa_api_key_here
\`\`\`

### 4. Start Development Server
\`\`\`bash
npm run dev
# or
yarn dev
\`\`\`

Visit [http://localhost:3000](http://localhost:3000) to see the application.

## 📖 User Guide

### Getting Started

1. **Configure API Key**
   - Navigate to Settings → API Configuration
   - Enter your Exa API key
   - Test the connection to ensure it's working

2. **Create Your First Query**
   - Go to Query Builder
   - Fill in query details (name, search terms, category)
   - Configure filters (domains, result count)
   - Set up scheduling if needed
   - Save and run the query

3. **Monitor Results**
   - Use Query Monitor to track execution
   - View real-time progress and results
   - Check for any errors or issues

### Core Workflows

#### Query Management
1. **Create Query**: Define search parameters and filters
2. **Execute Query**: Run manually or on schedule
3. **Monitor Progress**: Real-time execution tracking
4. **Review Results**: Analyze search results and rankings

#### Ranking Analysis
1. **Capture Snapshots**: Store search results at specific times
2. **Compare Rankings**: Analyze changes between snapshots
3. **Track Performance**: Monitor ranking stability and volatility
4. **Generate Reports**: Export data and insights

#### Feedback & Annotation
1. **Rate Results**: Provide quality ratings for search results
2. **Add Comments**: Detailed feedback on result relevance
3. **Track Improvements**: Monitor how feedback affects rankings
4. **Export Feedback**: Share insights with team members

### Page Overview

#### Dashboard
- Overview of all queries and recent activity
- Key performance metrics and trends
- Quick access to run queries
- Recent snapshots and changes

#### Query Builder
- Create and edit search queries
- Configure advanced filters and parameters
- Set up automated scheduling
- Tag and categorize queries

#### Query Monitor
- Real-time query execution tracking
- Progress monitoring and status updates
- Error handling and retry mechanisms
- Batch execution capabilities

#### Analytics
- Comprehensive performance metrics
- Ranking stability and volatility analysis
- Domain diversity tracking
- Response time monitoring
- Trend analysis and insights

#### Snapshots
- Historical search result storage
- Snapshot comparison tools
- Export and sharing capabilities
- Performance tracking over time

#### Compare Rankings
- Side-by-side snapshot comparison
- Ranking change analysis
- Position movement tracking
- Visual change indicators

#### Feedback
- Result quality rating system
- Detailed feedback and comments
- Relevance and authority scoring
- Feedback trend analysis

#### Settings
- API key configuration
- Notification preferences
- Application settings
- Data management tools
- Security settings

## 🔧 Configuration

### API Configuration
The application requires an Exa API key to function. Configure it in:
1. Environment variables (`.env.local`)
2. Settings page (runtime configuration)

### Notification Settings
Configure notifications for:
- Query completion
- Query failures
- Weekly reports
- Ranking changes

### Data Management
- Export all data as JSON
- Clear application data
- Monitor storage usage
- Backup and restore

## 📊 Analytics & Metrics

### Key Performance Indicators
- **Ranking Stability**: Percentage of results maintaining position
- **Volatility Index**: Measure of ranking fluctuation
- **Domain Diversity**: Number of unique domains in results
- **Response Time**: Average API response time
- **Success Rate**: Percentage of successful queries

### Tracking Capabilities
- Position changes over time
- New content discovery
- Domain authority trends
- Query performance metrics
- User feedback patterns

## 🔒 Security

### Data Protection
- API keys encrypted in storage
- Secure API communication (HTTPS)
- Local data storage (no external databases)
- Export/import for data portability

### Best Practices
- Regular API key rotation
- Monitor API usage and limits
- Secure environment variable storage
- Regular data backups

## 🚀 Deployment

### Vercel (Recommended)
1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Other Platforms
The application can be deployed to any platform supporting Next.js:
- Netlify
- Railway
- DigitalOcean App Platform
- AWS Amplify

### Environment Variables
Required for production:
\`\`\`env
EXA_API_KEY=your_production_api_key
\`\`\`

## 🤝 Contributing

### Development Setup
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

### Code Standards
- TypeScript for all new code
- ESLint configuration compliance
- Responsive design principles
- Accessibility best practices

### Testing
- Test API integrations thoroughly
- Verify responsive design
- Check accessibility compliance
- Validate TypeScript types

## 📝 API Reference

### Exa API Integration
The application integrates with Exa's search API:
- Search endpoint: `POST /search`
- Similar content: `POST /findSimilar`
- Content retrieval: `POST /contents`

### Internal API Endpoints
- `GET /api/queries` - List all queries
- `POST /api/queries` - Create new query
- `POST /api/queries/[id]/run` - Execute query
- `GET /api/snapshots` - List snapshots
- `GET /api/analytics` - Get analytics data
- `POST /api/feedback` - Submit feedback

## 🐛 Troubleshooting

### Common Issues

#### API Connection Errors
- Verify API key is correct
- Check network connectivity
- Ensure API key has sufficient quota
- Test connection in Settings

#### Query Execution Failures
- Check query parameters
- Verify domain filters are valid
- Ensure result count is within limits
- Review error messages in console

#### Performance Issues
- Reduce number of results per query
- Increase query intervals
- Clear old snapshots
- Check browser storage limits

### Getting Help
- Check the console for error messages
- Review API documentation at [exa.ai](https://exa.ai)
- Submit issues on GitHub
- Contact support for API-related issues

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Exa](https://exa.ai) for providing the search API
- [shadcn/ui](https://ui.shadcn.com) for the component library
- [Vercel](https://vercel.com) for hosting and deployment
- [Next.js](https://nextjs.org) team for the amazing framework

## 📞 Support

For support and questions:
- GitHub Issues: [Create an issue](https://github.com/your-username/exa-ranking-lab/issues)
- Documentation: [Wiki](https://github.com/your-username/exa-ranking-lab/wiki)
- Email: support@exa-ranking-lab.com

---

Built with ❤️ by the Exa Ranking Lab team
