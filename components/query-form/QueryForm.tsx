"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { X, Plus } from "lucide-react"
import type { QueryConfig } from "@/lib/types"
import { useQueryFormLogic } from "./useQueryFormLogic"
import { CATEGORY_MAP, CATEGORY_MAP_REVERSE } from "@/lib/category-map"

interface QueryFormProps {
	onSubmit: (data: Omit<QueryConfig, "id" | "createdAt" | "userId">) => void
}

export function QueryForm({ onSubmit }: QueryFormProps) {
	const {
		form,
		selectedTags,
		setSelectedTags,
		domainInput,
		setDomainInput,
		tagInput,
		setTagInput,
		handleDomainAdd,
		handleDomainRemove,
		handleTagSelect,
		handleTagRemove,
		onFormSubmit,
		tagSuggestions,
		QueryCategory,
		QueryFrequency,
	} = useQueryFormLogic(onSubmit)
console.log('QueryForm', form.getValues()," selectedTags:", selectedTags, "domainInput:", domainInput, "tagInput:", tagInput)
	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onFormSubmit)} className="space-y-6">
				<FormField
					control={form.control}
					name="name"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Query Name</FormLabel>
							<FormControl>
								<Input {...field} placeholder="Enter a name for your query" />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="query"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Search Query</FormLabel>
							<FormControl>
								<Input {...field} placeholder="Enter your search query" />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="category"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Category</FormLabel>
							<Select onValueChange={field.onChange} defaultValue={field.value}>
								<FormControl>
									<SelectTrigger>
										<SelectValue placeholder="Select a category" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									{(QueryCategory.options as string[]).map((option) => (
										<SelectItem key={option} value={option}>
											{option.charAt(0).toUpperCase() + option.slice(1)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="filters.numResults"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Number of Results</FormLabel>
							<FormControl>
								<Input
									type="number"
									{...field}
									onChange={(e) => field.onChange(parseInt(e.target.value))}
									min={1}
									max={100}
								/>
							</FormControl>
							<FormDescription>Choose between 1 and 100 results</FormDescription>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="filters.includeDomains"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Include Domains</FormLabel>
							<FormControl>
								<div className="flex gap-2">
									<Input
										placeholder="Enter a domain"
										value={domainInput}
										onChange={(e) => setDomainInput(e.target.value)}
									/>
									<Button
										variant="outline"
										onClick={() => handleDomainAdd(domainInput, "include")}
									>
										Add
									</Button>
								</div>
							</FormControl>
							<FormMessage />
							<div className="mt-2 flex flex-wrap gap-2">
								{form.getValues("filters.includeDomains").map((domain: string) => (
									<Badge key={domain} variant="outline" className="flex items-center gap-2">
										{domain}
										<X
											className="cursor-pointer"
											onClick={() => handleDomainRemove(domain, "include")}
										/>
									</Badge>
								))}
							</div>
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="filters.excludeDomains"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Exclude Domains</FormLabel>
							<FormControl>
								<div className="flex gap-2">
									<Input
										placeholder="Enter a domain"
										value={domainInput}
										onChange={(e) => setDomainInput(e.target.value)}
									/>
									<Button
										variant="outline"
										onClick={() => handleDomainAdd(domainInput, "exclude")}
									>
										Add
									</Button>
								</div>
							</FormControl>
							<FormMessage />
							<div className="mt-2 flex flex-wrap gap-2">
								{form.getValues("filters.excludeDomains").map((domain: string) => (
									<Badge key={domain} variant="outline" className="flex items-center gap-2">
										{domain}
										<X
											className="cursor-pointer"
											onClick={() => handleDomainRemove(domain, "exclude")}
										/>
									</Badge>
								))}
							</div>
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="schedule.enabled"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Enable Schedule</FormLabel>
							<FormControl>
								<Switch
									checked={field.value}
									onCheckedChange={field.onChange}
									aria-label="Enable schedule"
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				{form.watch("schedule.enabled") && (
					<FormField
						control={form.control}
						name="schedule.frequency"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Frequency</FormLabel>
								<Select onValueChange={field.onChange} defaultValue={field.value}>
									<FormControl>
										<SelectTrigger>
											<SelectValue placeholder="Select frequency" />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{(QueryFrequency.options as string[]).map((option) => (
											<SelectItem key={option} value={option}>
												{option.charAt(0).toUpperCase() + option.slice(1)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<FormMessage />
							</FormItem>
						)}
					/>
				)}

				<FormField
					control={form.control}
					name="tags"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Tags</FormLabel>
							<FormControl>
								<div className="flex gap-2">
									<Input
										placeholder="Enter a tag"
										value={tagInput}
										onChange={(e) => setTagInput(e.target.value)}
									/>
									<Button variant="outline" onClick={() => handleTagSelect(tagInput)}>
										Add
									</Button>
								</div>
							</FormControl>
							<FormMessage />
							<div className="mt-2 flex flex-wrap gap-2">
								{selectedTags.map((tag) => (
									<Badge key={tag} variant="outline" className="flex items-center gap-2">
										{tag}
										<X className="cursor-pointer" onClick={() => handleTagRemove(tag)} />
									</Badge>
								))}
							</div>
						</FormItem>
					)}
				/>

				<Button type="submit" className="w-full">
					Submit Query
				</Button>
			</form>
		</Form>
	)
}
